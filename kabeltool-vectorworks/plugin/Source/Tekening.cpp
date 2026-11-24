#include "StdAfx.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdio>
#include <fstream>
#include <functional>
#include <sstream>
#include <string>
#include <vector>

#include "Kabeltool.h"
#include "Tekening.h"

// Kabeltool – Vectorworks-kant in C++. Zelfde werking als het oude kabeltool.py, maar zonder Python:
// Python starten vanuit de plug-in liet Vectorworks crashen.
//
// Bestanden naast de tekening (zelfde naam als de .vwx):
//   <naam>.kt-tekening.json   geometrie (ook rechtstreeks naar de palette via "laad")
//   <naam>.kt-project.json    geschreven door de palette (instellingen, nummers, labels, stempels)

using namespace Kabeltool;
using json = nlohmann::json;

namespace
{
	const char* REC		= "KT_Obj";				// op dim city, vloerroute, truss-lijn en drop
	const char* GEN		= "KT_Gen";				// op alles wat de tool zelf tekent (wordt bij bijwerken vervangen)
	const char* LINK	= "KT_Link";			// op lampen: bij welke drop ze horen
	const char* LD		= "Lighting Device";
	const char* LAAG_LAMPEN = "Lightplot";		// laag voor de lampen van de demo-show

	const double MM = 1000.0;					// millimeter per meter (interne eenheid van Vectorworks)

	typedef std::array<double, 3>	P3;			// punt in meters
	typedef std::vector<P3>			Punten;

	// --------------------------------------------------------------------------------------------------------
	// Meldingen van de lopende actie (naar de palette of als venster na een tool)
	std::vector<std::string> gMeldingen;

	void Meld(const std::string& tekst)
	{
		gMeldingen.push_back( tekst );
	}

	// Fout die de actie afbreekt (wordt netjes teruggemeld, geen crash)
	struct Stop
	{
		std::string tekst;
	};

	// --------------------------------------------------------------------------------------------------------
	// Ongedaan maken: één stap per actie
	class Undo
	{
	public:
		explicit Undo(const char* naam)
		{
			gSDK->SupportUndoAndRemove();
			gSDK->SetUndoMethod( kUndoSwapObjects );
			gSDK->NameUndoEvent( TXString( naam ) );
		}
		~Undo()
		{
			gSDK->EndUndoEvent();
		}
		void Nieuw(MCObjectHandle h)		{ if ( h ) gSDK->AddAfterSwapObject( h ); }
		void VoorWijziging(MCObjectHandle h){ if ( h ) gSDK->AddBeforeSwapObject( h ); }
		void NaWijziging(MCObjectHandle h)	{ if ( h ) gSDK->AddAfterSwapObject( h ); }
		void Weg(MCObjectHandle h)
		{
			if ( ! h ) return;
			gSDK->AddBeforeSwapObject( h );
			gSDK->DeleteObject( h, false );
		}
	};

	// --------------------------------------------------------------------------------------------------------
	// Tekst en getallen
	std::string Std(const TXString& s)	{ return s.GetStdString(); }
	TXString	Tx(const std::string& s)	{ return TXString( s ); }

	std::string Getal(double v)
	{
		char buf[64];
		std::snprintf( buf, sizeof(buf), "%.4f", v );
		std::string s = buf;
		while ( ! s.empty() && s.back() == '0' ) s.pop_back();
		if ( ! s.empty() && s.back() == '.' ) s.pop_back();
		if ( s == "-0" ) s = "0";
		return s;
	}

	double NaarGetal(const json& v, double standaard)
	{
		try
		{
			if ( v.is_number() ) return v.get<double>();
			if ( v.is_string() )
			{
				std::string s = v.get<std::string>();
				std::replace( s.begin(), s.end(), ',', '.' );
				if ( s.empty() ) return standaard;
				size_t gelezen = 0;
				double d = std::stod( s, &gelezen );
				return gelezen ? d : standaard;
			}
		}
		catch ( ... ) {}
		return standaard;
	}

	double NaarGetal(const std::string& s, double standaard)
	{
		return NaarGetal( json( s ), standaard );
	}

	std::string Tekst(const json& o, const char* sleutel, const std::string& standaard = "")
	{
		if ( o.is_object() && o.contains( sleutel ) )
		{
			const json& v = o[sleutel];
			if ( v.is_string() ) return v.get<std::string>();
			if ( v.is_number() ) return Getal( v.get<double>() );
		}
		return standaard;
	}

	// --------------------------------------------------------------------------------------------------------
	// Bestanden
	std::wstring Wide(const std::string& utf8) { return TXString( utf8 ).GetStdWString(); }

	json LeesJson(const std::string& pad)
	{
		std::ifstream f( Wide( pad ), std::ios::binary );
		if ( ! f ) return json::object();
		std::stringstream buf;
		buf << f.rdbuf();
		json j = json::parse( buf.str(), nullptr, false );
		return j.is_discarded() ? json::object() : j;
	}

	void SchrijfJson(const std::string& pad, const json& j)
	{
		std::ofstream f( Wide( pad ), std::ios::binary | std::ios::trunc );
		f << j.dump( 1 );
	}

	// Pad van de tekening zonder .vwx; leeg als de tekening nog niet is opgeslagen.
	std::string Basis()
	{
		VectorWorks::Filing::IFileIdentifierPtr	file;
		bool saved = false;
		if ( ! gSDK->GetActiveDocument( & file, saved ) || ! file )
			return "";
		bool bestaat = false;
		file->ExistsOnDisk( bestaat );
		if ( ! bestaat )
			return "";
		TXString pad;
		file->GetFileFullPath( pad );
		std::string s = Std( pad );
		size_t punt = s.find_last_of( '.' ), slash = s.find_last_of( "\\/" );
		if ( punt != std::string::npos && ( slash == std::string::npos || punt > slash ) )
			s = s.substr( 0, punt );
		return s;
	}

	std::string BasisVerplicht()
	{
		std::string b = Basis();
		if ( b.empty() )
			throw Stop{ "Sla de tekening eerst op; de Kabeltool zet zijn bestanden ernaast." };
		return b;
	}

	std::string Bestandsnaam(const std::string& pad)
	{
		size_t slash = pad.find_last_of( "\\/" );
		return slash == std::string::npos ? pad : pad.substr( slash + 1 );
	}

	json LeesProject()
	{
		return LeesJson( BasisVerplicht() + ".kt-project.json" );
	}

	// Instellingen: standaard + wat de palette in het projectbestand heeft gezet
	struct Inst
	{
		std::string prefix		= "PP/";
		double symboolBreedte	= 20;
		double symboolHoogte	= 4;
		double dimcityMaat		= 1;
		std::string laagCabling	= "Cabling";
		std::string laagInfra	= "Infraplot";
	};

	Inst LeesInst()
	{
		Inst inst;
		json p = LeesProject();
		if ( p.is_object() && p.contains( "instellingen" ) && p["instellingen"].is_object() )
		{
			const json& s = p["instellingen"];
			inst.prefix			= Tekst( s, "prefix", inst.prefix );
			inst.laagCabling	= Tekst( s, "laagCabling", inst.laagCabling );
			inst.laagInfra		= Tekst( s, "laagInfra", inst.laagInfra );
			if ( s.contains( "symboolBreedte" ) )	inst.symboolBreedte	= NaarGetal( s["symboolBreedte"], inst.symboolBreedte );
			if ( s.contains( "symboolHoogte" ) )	inst.symboolHoogte	= NaarGetal( s["symboolHoogte"], inst.symboolHoogte );
			if ( s.contains( "dimcityMaat" ) )		inst.dimcityMaat	= NaarGetal( s["dimcityMaat"], inst.dimcityMaat );
		}
		if ( inst.laagCabling.empty() )	inst.laagCabling = "Cabling";
		if ( inst.laagInfra.empty() )	inst.laagInfra = "Infraplot";
		if ( inst.symboolBreedte <= 0 )	inst.symboolBreedte = 20;
		if ( inst.symboolHoogte <= 0 )	inst.symboolHoogte = 4;
		if ( inst.dimcityMaat <= 0 )	inst.dimcityMaat = 1;
		return inst;
	}

	// --------------------------------------------------------------------------------------------------------
	// Records
	void ZorgRecord(const char* naam, const std::vector<const char*>& velden)
	{
		MCObjectHandle h = gSDK->GetNamedObject( naam );
		if ( ! h )
		{
			TFormatHandler maak( Tx( naam ) );			// maakt het recordformaat aan
			h = gSDK->GetNamedObject( naam );
		}
		if ( ! h || ! VWRecordFormatObj::IsRecordFormatObject( h ) )
			throw Stop{ std::string( "Recordformaat " ) + naam + " kon niet gemaakt worden (bestaat de naam al voor iets anders?)." };

		VWRecordFormatObj fmt( h );
		for ( const char* veld : velden )
			if ( fmt.GetParamIndex( veld ) == size_t(-1) )
				fmt.AddParamString( veld, "" );
	}

	void ZorgRecords()
	{
		ZorgRecord( REC,	{ "soort", "id", "naam", "ouder", "z" } );
		ZorgRecord( GEN,	{ "soort" } );
		ZorgRecord( LINK,	{ "drop" } );
	}

	std::string Veld(MCObjectHandle h, const char* rec, const char* veld)
	{
		try
		{
			MCObjectHandle hr = VWRecordObj::GetRecordObject( h, rec );
			if ( ! hr ) return "";
			VWRecordObj r( hr );
			if ( r.GetParamIndex( veld ) == size_t(-1) ) return "";
			return Std( r.GetParamValue( veld ) );
		}
		catch ( ... ) { return ""; }
	}

	void ZetVeld(MCObjectHandle h, const char* rec, const char* veld, const std::string& waarde)
	{
		MCObjectHandle hr = VWRecordObj::GetRecordObject( h, rec );
		if ( ! hr )
		{
			MCObjectHandle fmt = gSDK->GetNamedObject( rec );
			if ( ! fmt ) return;
			VWRecordObj nieuw( fmt, h, true );
			hr = VWRecordObj::GetRecordObject( h, rec );
			if ( ! hr ) return;
		}
		VWRecordObj r( hr );
		if ( r.GetParamIndex( veld ) == size_t(-1) ) return;
		r.SetParamValue( veld, Tx( waarde ) );
	}

	void Merk(MCObjectHandle h, const std::string& soort, const std::string& id,
			  const std::string& naam = "", const std::string& ouder = "", const std::string& z = "")
	{
		ZetVeld( h, REC, "soort", soort );
		ZetVeld( h, REC, "id", id );
		ZetVeld( h, REC, "naam", naam );
		ZetVeld( h, REC, "ouder", ouder );
		ZetVeld( h, REC, "z", z );
	}

	// --------------------------------------------------------------------------------------------------------
	// Objecten zoeken (zelfde criteria als in VectorScript/Python)
	std::vector<MCObjectHandle> Objecten(const std::string& criteria)
	{
		std::vector<MCObjectHandle> lijst;
		gSDK->ForEachObjectInCriteria( Tx( criteria ), [&](MCObjectHandle h) { if ( h ) lijst.push_back( h ); } );
		return lijst;
	}

	std::string MetRecord(const char* rec) { return std::string( "(R IN ['" ) + rec + "'])"; }

	int Volgende(const std::string& soort, const std::string& letter)
	{
		int hoogste = 0;
		for ( MCObjectHandle h : Objecten( MetRecord( REC ) ) )
		{
			if ( Veld( h, REC, "soort" ) != soort ) continue;
			std::string id = Veld( h, REC, "id" );
			if ( id.size() <= letter.size() ) continue;
			try { hoogste = std::max( hoogste, std::stoi( id.substr( letter.size() ) ) ); }
			catch ( ... ) {}
		}
		return hoogste + 1;
	}

	std::string Uuid(MCObjectHandle h)
	{
		TXString u;
		gSDK->GetObjectUuid( h, u );
		return Std( u );
	}

	// --------------------------------------------------------------------------------------------------------
	// Klassen en lagen
	void ZetKlasse(MCObjectHandle h, const std::string& naam)
	{
		if ( ! h || naam.empty() ) return;
		VWClass klasse( Tx( naam ) );				// maakt de klasse aan als hij nog niet bestaat
		gSDK->SetObjectClass( h, (InternalIndex) klasse );
	}

	std::string KlasseVan(MCObjectHandle h)
	{
		TXString naam;
		gSDK->ClassIDToName( gSDK->GetObjectClass( h ), naam );
		return Std( naam );
	}

	std::string ActieveKlasse()
	{
		TXString naam;
		gSDK->ClassIDToName( VWClass::GetActiveClass(), naam );
		return Std( naam );
	}

	MCObjectHandle Laag(const std::string& naam)
	{
		MCObjectHandle h = gSDK->GetNamedObject( Tx( naam ) );
		if ( h && gSDK->GetObjectTypeN( h ) == kLayerNode )
			return h;
		if ( h )
			throw Stop{ "De naam '" + naam + "' is al in gebruik voor iets anders dan een laag." };
		h = gSDK->CreateLayer( Tx( naam ), kLayerDesign );
		if ( ! h )
			throw Stop{ "Laag '" + naam + "' kon niet gemaakt worden." };
		return h;
	}

	void NaarLaag(MCObjectHandle h, MCObjectHandle laag)
	{
		if ( h && laag && gSDK->ParentObject( h ) != laag )
			gSDK->AddObjectToContainer( h, laag );
	}

	std::string ZonderPrefix(const std::string& klasse, const Inst& inst)
	{
		if ( ! inst.prefix.empty() && klasse.compare( 0, inst.prefix.size(), inst.prefix ) == 0 )
			return klasse.substr( inst.prefix.size() );
		return klasse;
	}

	// --------------------------------------------------------------------------------------------------------
	// Geometrie (meters)
	Punten PuntenVan(MCObjectHandle h)
	{
		Punten pts;
		short t = gSDK->GetObjectTypeN( h );
		if ( t == kLineNode )
		{
			WorldPt a, b;
			gSDK->GetEndPoints( h, a, b );
			pts.push_back( { a.x / MM, a.y / MM, 0.0 } );
			pts.push_back( { b.x / MM, b.y / MM, 0.0 } );
		}
		else if ( t == kPolygonNode || t == kPolylineNode )
		{
			VWPolygon2DObj p( h );
			for ( size_t i = 0; i < p.GetVertexCount(); i++ )
			{
				VWPoint2D q = p.GetVertexPoint( i );
				pts.push_back( { q.x / MM, q.y / MM, 0.0 } );
			}
		}
		else if ( t == qPolyNode )
		{
			VWPolygon3DObj p( h );
			for ( size_t i = 0; i < p.GetVertexCount(); i++ )
			{
				VWPoint3D q = p.GetVertex( i );
				pts.push_back( { q.x / MM, q.y / MM, q.z / MM } );
			}
		}
		return pts;
	}

	bool IsLijnSoort(short t)
	{
		return t == kLineNode || t == kPolygonNode || t == kPolylineNode || t == qPolyNode;
	}

	P3 Midden(MCObjectHandle h)
	{
		WorldRect r;
		gSDK->GetObjectBounds( h, r );
		WorldPt c = r.Center();
		return { c.x / MM, c.y / MM, 0.0 };
	}

	json NaarJson(const Punten& pts)
	{
		json a = json::array();
		for ( const P3& p : pts ) a.push_back( json::array( { p[0], p[1], p[2] } ) );
		return a;
	}

	struct Truss
	{
		MCObjectHandle	h;
		std::string		id, naam;
		Punten			punten;
	};

	std::vector<Truss> Trussen()
	{
		std::vector<Truss> lijst;
		for ( MCObjectHandle h : Objecten( MetRecord( REC ) ) )
		{
			if ( Veld( h, REC, "soort" ) != "truss" ) continue;
			Truss t{ h, Veld( h, REC, "id" ), Veld( h, REC, "naam" ), PuntenVan( h ) };
			if ( gSDK->GetObjectTypeN( h ) != qPolyNode )
			{
				double z = NaarGetal( Veld( h, REC, "z" ), 0.0 );
				for ( P3& p : t.punten ) p[2] = z;
			}
			lijst.push_back( t );
		}
		return lijst;
	}

	// Dichtstbijzijnde punt op een lijn in bovenaanzicht: (afstand, punt)
	bool OpLijn(const Punten& pts, double px, double py, double& afstand, P3& q)
	{
		bool gevonden = false;
		for ( size_t i = 0; i + 1 < pts.size(); i++ )
		{
			const P3& a = pts[i];
			const P3& b = pts[i + 1];
			double vx = b[0] - a[0], vy = b[1] - a[1], l2 = vx * vx + vy * vy;
			double t = l2 > 0 ? ( ( px - a[0] ) * vx + ( py - a[1] ) * vy ) / l2 : 0.0;
			t = std::max( 0.0, std::min( 1.0, t ) );
			P3 p = { a[0] + vx * t, a[1] + vy * t, a[2] + ( b[2] - a[2] ) * t };
			double d = std::hypot( p[0] - px, p[1] - py );
			if ( ! gevonden || d < afstand )
			{
				afstand = d;
				q = p;
				gevonden = true;
			}
		}
		return gevonden;
	}

	// --------------------------------------------------------------------------------------------------------
	// Tekenen van de vaste onderdelen (punten in meters)
	MCObjectHandle MaakTekst(const std::string& tekst, double x, double y, double punten, int uitlijning)
	{
		VWTextBlockObj t( Tx( tekst ), VWPoint2D( x, y ) );
		t.SetTextSizeByPoint( std::max( 2.0, punten ) );
		t.SetTextJustification( uitlijning == 1 ? kTextHorzAlign_Left : uitlijning == 3 ? kTextHorzAlign_Right : kTextHorzAlign_Center );
		t.SetTextVerticalAlignment( kTextVertAlign_CenterBox );
		return t.GetThisObject();
	}

	std::string MaakDimcity(double x, double y, const Inst& inst, Undo& undo)
	{
		std::string naam	= "DB" + std::to_string( Volgende( "dimcity", "DB" ) );
		std::string klasse	= inst.prefix + naam;
		MCObjectHandle laag	= Laag( inst.laagCabling );
		double s			= inst.dimcityMaat * MM / 2.0;
		double cx = x * MM, cy = y * MM;

		MCObjectHandle h = gSDK->CreateRectangle( WorldRect( WorldPt( cx - s, cy + s ), WorldPt( cx + s, cy - s ) ) );
		if ( ! h ) throw Stop{ "Dim city kon niet getekend worden." };
		ZetKlasse( h, klasse );
		NaarLaag( h, laag );
		Merk( h, "dimcity", naam, naam );
		undo.Nieuw( h );

		MCObjectHandle t = MaakTekst( naam, cx, cy, 14, 2 );
		ZetKlasse( t, klasse );
		NaarLaag( t, laag );
		undo.Nieuw( t );
		return naam;
	}

	void MaakVloer(const Punten& pts, const std::string& klasse, const Inst& inst, Undo& undo)
	{
		MCObjectHandle laag = Laag( inst.laagCabling );
		VWPolygon2DObj p;
		for ( const P3& q : pts ) p.AddCornerVertex( q[0] * MM, q[1] * MM );
		p.SetClosed( false );
		MCObjectHandle h = p.GetThisObject();
		ZetKlasse( h, klasse );
		NaarLaag( h, laag );
		Merk( h, "vloer", "V" + std::to_string( Volgende( "vloer", "V" ) ) );
		undo.Nieuw( h );
	}

	void MaakTruss(const std::string& naam, const Punten& pts, const Inst& inst, Undo& undo)
	{
		MCObjectHandle laag = Laag( inst.laagInfra );
		VWPolygon3DObj p;
		for ( const P3& q : pts ) p.AddVertex( q[0] * MM, q[1] * MM, q[2] * MM );
		p.SetClosed( false );
		MCObjectHandle h = p.GetThisObject();
		ZetKlasse( h, inst.prefix + naam );
		NaarLaag( h, laag );
		Merk( h, "truss", "T" + std::to_string( Volgende( "truss", "T" ) ), naam, "", "" );
		undo.Nieuw( h );
	}

	struct Drop
	{
		std::string id, truss;
		double x, y, z;
	};

	bool MaakDrop(double x, double y, const Inst& inst, Undo& undo, Drop& uit)
	{
		const Truss* best = nullptr;
		double bestD = 0;
		P3 bestQ = { 0, 0, 0 };
		std::vector<Truss> trussen = Trussen();
		for ( const Truss& t : trussen )
		{
			if ( t.punten.size() < 2 ) continue;
			double d; P3 q;
			if ( OpLijn( t.punten, x, y, d, q ) && ( ! best || d < bestD ) )
			{
				best = &t; bestD = d; bestQ = q;
			}
		}
		if ( ! best )
		{
			Meld( "Er is nog geen truss-lijn. Maak die eerst." );
			return false;
		}

		MCObjectHandle laag	= Laag( inst.laagCabling );
		double r			= 0.15 * MM;
		double cx = bestQ[0] * MM, cy = bestQ[1] * MM;
		MCObjectHandle h = gSDK->CreateOval( WorldRect( WorldPt( cx - r, cy + r ), WorldPt( cx + r, cy - r ) ) );
		if ( ! h ) throw Stop{ "Drop kon niet getekend worden." };
		ZetKlasse( h, inst.prefix + best->naam );
		NaarLaag( h, laag );
		uit = { "D" + std::to_string( Volgende( "drop", "D" ) ), best->id, bestQ[0], bestQ[1], bestQ[2] };
		Merk( h, "drop", uit.id, "", best->id, Getal( bestQ[2] ) );
		undo.Nieuw( h );
		uit.truss = best->naam;					// voor de klasse van de lampen
		return true;
	}

	// --------------------------------------------------------------------------------------------------------
	// Uitwisselen met de palette
	json Exporteer()
	{
		std::string b = BasisVerplicht();
		ZorgRecords();
		json data = {
			{ "versie", 1 }, { "dimcities", json::array() }, { "vloerroutes", json::array() }, { "trusslijnen", json::array() },
			{ "drops", json::array() }, { "lampen", json::array() }, { "selectie", json::array() } };

		for ( MCObjectHandle h : Objecten( MetRecord( REC ) ) )
		{
			std::string soort = Veld( h, REC, "soort" ), id = Veld( h, REC, "id" );
			if ( soort == "dimcity" )
			{
				P3 c = Midden( h );
				int nr = 1;
				try { nr = std::stoi( id.substr( 2 ) ); } catch ( ... ) {}
				data["dimcities"].push_back( { { "id", id }, { "nr", nr }, { "uuid", Uuid( h ) }, { "x", c[0] }, { "y", c[1] }, { "z", 0 } } );
			}
			else if ( soort == "vloer" )
			{
				data["vloerroutes"].push_back( { { "id", id }, { "uuid", Uuid( h ) }, { "punten", NaarJson( PuntenVan( h ) ) } } );
			}
			else if ( soort == "drop" )
			{
				P3 c = Midden( h );
				data["drops"].push_back( { { "id", id }, { "uuid", Uuid( h ) }, { "truss", Veld( h, REC, "ouder" ) },
										   { "x", c[0] }, { "y", c[1] }, { "z", NaarGetal( Veld( h, REC, "z" ), 0.0 ) } } );
			}
		}
		for ( const Truss& t : Trussen() )
			data["trusslijnen"].push_back( { { "id", t.id }, { "uuid", Uuid( t.h ) }, { "naam", t.naam }, { "klasse", t.naam }, { "punten", NaarJson( t.punten ) } } );

		for ( MCObjectHandle h : Objecten( MetRecord( LINK ) ) )
		{
			std::string naam = Veld( h, LD, "Inst Type" ) + " " + Veld( h, LD, "Unit Number" );
			while ( ! naam.empty() && naam.back() == ' ' ) naam.pop_back();
			while ( ! naam.empty() && naam.front() == ' ' ) naam.erase( 0, 1 );
			data["lampen"].push_back( { { "uuid", Uuid( h ) }, { "naam", naam }, { "drop", Veld( h, LINK, "drop" ) } } );
		}
		for ( MCObjectHandle h : Objecten( "(SEL=TRUE) & " + MetRecord( REC ) ) )
			data["selectie"].push_back( Veld( h, REC, "id" ) );

		for ( const char* lijst : { "dimcities", "vloerroutes", "trusslijnen", "drops" } )
		{
			json& a = data[lijst];
			std::sort( a.begin(), a.end(), [](const json& p, const json& q) {
				std::string i = p.value( "id", "" ), j = q.value( "id", "" );
				return i.size() != j.size() ? i.size() < j.size() : i < j;
			} );
		}

		SchrijfJson( b + ".kt-tekening.json", data );
		return data;
	}

	void SelecteerId(const std::string& doel)
	{
		if ( doel.empty() ) return;
		gSDK->DeselectAll();
		for ( MCObjectHandle h : Objecten( MetRecord( REC ) ) )
			if ( Veld( h, REC, "id" ) == doel ) gSDK->SelectObject( h, true );
		for ( MCObjectHandle h : Objecten( MetRecord( LINK ) ) )
			if ( Veld( h, LINK, "drop" ) == doel ) gSDK->SelectObject( h, true );
	}

	// --------------------------------------------------------------------------------------------------------
	// Acties
	json Laad()
	{
		std::string b = BasisVerplicht();
		json project = LeesJson( b + ".kt-project.json" );
		json t = Exporteer();
		return { { "tekening", t }, { "project", project.empty() ? json() : project }, { "basis", Bestandsnaam( b ) } };
	}

	json Bewaar(const json& args)
	{
		std::string b = BasisVerplicht();
		SchrijfJson( b + ".kt-project.json", args );
		return true;
	}

	json Selectie()
	{
		json a = json::array();
		for ( MCObjectHandle h : Objecten( "(SEL=TRUE) & " + MetRecord( REC ) ) )
			a.push_back( Veld( h, REC, "id" ) );
		return a;
	}

	void VloerVanSelectie()
	{
		Inst inst = LeesInst();
		ZorgRecords();
		Undo undo( "Kabeltool: vloerroute" );
		int n = 0;
		for ( MCObjectHandle h : Objecten( "(SEL=TRUE)" ) )
		{
			if ( ! IsLijnSoort( gSDK->GetObjectTypeN( h ) ) || ! Veld( h, REC, "id" ).empty() ) continue;
			undo.VoorWijziging( h );
			Merk( h, "vloer", "V" + std::to_string( Volgende( "vloer", "V" ) ) );
			undo.NaWijziging( h );
			n++;
		}
		if ( ! n ) Meld( "Selecteer eerst een lijn of polylijn." );
	}

	void TrussVanSelectie(const json& args)
	{
		Inst inst = LeesInst();
		ZorgRecords();
		Undo undo( "Kabeltool: truss-lijn" );
		double hoogte = NaarGetal( args.is_object() && args.contains( "hoogte" ) ? args["hoogte"] : json(), 8.0 );
		int n = 0;
		for ( MCObjectHandle h : Objecten( "(SEL=TRUE)" ) )
		{
			short t = gSDK->GetObjectTypeN( h );
			if ( ! IsLijnSoort( t ) || ! Veld( h, REC, "id" ).empty() ) continue;
			std::string naam = ZonderPrefix( KlasseVan( h ), inst );
			if ( naam.empty() || naam == "None" )
			{
				char buf[16];
				std::snprintf( buf, sizeof(buf), "LX%02d", Volgende( "truss", "T" ) );
				naam = buf;
			}
			undo.VoorWijziging( h );
			ZetKlasse( h, inst.prefix + naam );
			Merk( h, "truss", "T" + std::to_string( Volgende( "truss", "T" ) ), naam, "", t == qPolyNode ? "" : Getal( hoogte ) );
			undo.NaWijziging( h );
			n++;
		}
		if ( ! n ) Meld( "Selecteer eerst een lijn, polylijn of 3D-polygoon." );
	}

	void LampenKoppelen()
	{
		ZorgRecords();
		std::string drop;
		for ( MCObjectHandle h : Objecten( "(SEL=TRUE)" ) )
			if ( Veld( h, REC, "soort" ) == "drop" ) drop = Veld( h, REC, "id" );
		if ( drop.empty() )
		{
			Meld( "Selecteer ook het rondje van de drop." );
			return;
		}
		Undo undo( "Kabeltool: lampen koppelen" );
		std::vector<MCObjectHandle> lampen = Objecten( std::string( "(SEL=TRUE) & (PON='" ) + LD + "')" );
		for ( MCObjectHandle h : lampen )
		{
			undo.VoorWijziging( h );
			ZetVeld( h, LINK, "drop", drop );
			undo.NaWijziging( h );
		}
		Meld( std::to_string( lampen.size() ) + " lampen gekoppeld aan " + drop + "." );
	}

	// ---------------- labels tekenen (Tekening bijwerken)
	CRGBColor Kleur(const std::string& hex)
	{
		std::string k = hex;
		if ( ! k.empty() && k[0] == '#' ) k.erase( 0, 1 );
		if ( k.size() < 6 ) return CRGBColor( 156, 156, 156 );
		try
		{
			return CRGBColor( (Uint8) std::stoi( k.substr( 0, 2 ), nullptr, 16 ),
							  (Uint8) std::stoi( k.substr( 2, 2 ), nullptr, 16 ),
							  (Uint8) std::stoi( k.substr( 4, 2 ), nullptr, 16 ) );
		}
		catch ( ... ) { return CRGBColor( 156, 156, 156 ); }
	}

	struct Tekenaar
	{
		const Inst&		inst;
		Undo&			undo;
		MCObjectHandle	laag;
		std::string		klasse;

		MCObjectHandle Gen(MCObjectHandle h, const char* soort = "label")
		{
			if ( ! h ) return h;
			ZetKlasse( h, klasse );
			NaarLaag( h, laag );
			ZetVeld( h, GEN, "soort", soort );
			undo.Nieuw( h );
			return h;
		}
		MCObjectHandle Lijn(double x1, double y1, double x2, double y2, const char* soort = "label")
		{
			VWLine2DObj l( x1, y1, x2, y2 );
			return Gen( l.GetThisObject(), soort );
		}
		MCObjectHandle Rechthoek(double l, double t, double r, double b, const char* soort = "label")
		{
			return Gen( gSDK->CreateRectangle( WorldRect( WorldPt( l, t ), WorldPt( r, b ) ) ), soort );
		}
		MCObjectHandle Ovaal(double x, double y, double r)
		{
			return Gen( gSDK->CreateOval( WorldRect( WorldPt( x - r, y + r ), WorldPt( x + r, y - r ) ) ) );
		}
		void Tekst(const std::string& tekst, double x, double y, double punten, int uitlijning)
		{
			Gen( MaakTekst( tekst, x, y, punten, uitlijning ) );
		}
		void Vul(MCObjectHandle h, const CRGBColor& kleur)
		{
			if ( ! h ) return;
			VWObjectAttr a( h );
			a.SetFillSolid();
			a.SetFillForeColor( kleur );
			a.SetFillBackColor( kleur );
		}

		// Blokje: links korte naam, rechts lengte, gekleurde balk over de volle breedte, nummer ernaast.
		void Kabelsymbool(double x, double top, double B, double H, const json& rij)
		{
			double vak = H * 0.78;
			Vul( Rechthoek( x, top, x + B, top - H ), CRGBColor( 255, 255, 255 ) );
			Vul( Rechthoek( x, top - vak, x + B, top - H ), Kleur( ::Tekst( rij, "kleur", "#9e9e9e" ) ) );
			Lijn( x + B / 2.0, top, x + B / 2.0, top - vak );
			double mm_h = inst.symboolHoogte * 0.78 * 0.7;
			auto pt = [&](const std::string& t) {
				double mm_b = ( inst.symboolBreedte / 2.0 * 0.85 ) / ( std::max<size_t>( t.size(), 1 ) * 0.6 );
				return std::min( mm_h, mm_b ) / 0.3528;
			};
			std::string kort = ::Tekst( rij, "kort" ), lengte = ::Tekst( rij, "lengte" ), nummer = ::Tekst( rij, "nummer" );
			Tekst( kort, x + B / 4.0, top - vak / 2.0, pt( kort ), 2 );
			Tekst( lengte, x + B * 0.75, top - vak / 2.0, pt( lengte ), 2 );
			if ( ! nummer.empty() )
				Tekst( nummer, x + B + H * 0.3, top - H / 2.0, inst.symboolHoogte * 0.7 / 0.3528, 1 );
		}

		void Label(const json& lb, double mm)
		{
			double B = inst.symboolBreedte * mm, H = inst.symboolHoogte * mm;
			double x = NaarGetal( lb.value( "x", json( 0 ) ), 0 ) * MM, y = NaarGetal( lb.value( "y", json( 0 ) ), 0 ) * MM;
			std::string soort = ::Tekst( lb, "soort" ), titel = ::Tekst( lb, "titel" );
			double titelpt = inst.symboolHoogte * 0.7 / 0.3528;

			if ( soort == "streepje" )						// lengtehulp
			{
				double nx = NaarGetal( lb.value( "nx", json( 0 ) ), 0 ) * H, ny = NaarGetal( lb.value( "ny", json( 1 ) ), 1 ) * H;
				Lijn( x - nx, y - ny, x + nx, y + ny, "streepje" );
				Tekst( titel, x + nx * 1.8, y + ny * 1.8, titelpt * 0.7, 2 );
				return;
			}
			if ( soort == "blok" )							// blok op de infra-laag
			{
				double top = y - H * 1.5 - NaarGetal( lb.value( "rijNr", json( 0 ) ), 0 ) * H * 1.3;
				Rechthoek( x - B / 2.0, top, x + B / 2.0, top - H, "blok" );
				Tekst( titel, x, top - H / 2.0, titelpt * 0.8, 2 );
				return;
			}
			if ( soort == "koppel" || soort == "bol" )		// stip / bolletje op het punt zelf
				Vul( Ovaal( x, y, H * ( soort == "bol" ? 0.6 : 0.3 ) ), CRGBColor( 0, 0, 0 ) );

			double ox = x + H * 2.5, oy = y + H * 2.5;		// leader naar het blok met kabels
			if ( soort == "dimcity" )
			{
				ox = x + inst.dimcityMaat * MM * 0.7;
				oy = y;
			}
			else
				Lijn( x, y, ox, oy );
			if ( ! titel.empty() )
				Tekst( titel, ox, oy + H * 0.6, titelpt, 1 );
			if ( lb.contains( "rijen" ) && lb["rijen"].is_array() )
			{
				size_t i = 0;
				for ( const json& rij : lb["rijen"] )
					Kabelsymbool( ox, oy - ( i++ ) * H * 1.2, B, H, rij );
			}
		}
	};

	void TekeningBijwerken()
	{
		json p = LeesProject();
		Inst inst = LeesInst();
		if ( ! p.is_object() || p.empty() )
		{
			Meld( "Geen projectbestand gevonden. Open de tekening eerst in de palette." );
			return;
		}
		ZorgRecords();
		Undo undo( "Kabeltool: tekening bijwerken" );
		for ( MCObjectHandle h : Objecten( MetRecord( GEN ) ) )
			undo.Weg( h );

		const json lijst = p.contains( "tekenlijst" ) && p["tekenlijst"].is_array() ? p["tekenlijst"] : json::array();
		int n = 0;
		for ( const char* sleutel : { "cabling", "infra" } )
		{
			std::vector<json> labels;
			for ( const json& l : lijst )
				if ( ::Tekst( l, "laag", "cabling" ) == sleutel ) labels.push_back( l );
			if ( labels.empty() ) continue;

			MCObjectHandle laag = Laag( std::string( sleutel ) == "infra" ? inst.laagInfra : inst.laagCabling );
			double schaal = 1.0;
			gSDK->GetLayerScaleN( laag, schaal );
			if ( schaal <= 0 ) schaal = 1.0;
			double mm = schaal;								// 1 mm op papier, in interne eenheden (mm)
			for ( const json& lb : labels )
			{
				std::string k = ::Tekst( lb, "klasse" );
				Tekenaar t{ inst, undo, laag, inst.prefix + ( k.empty() ? "Kabels" : k ) };
				t.Label( lb, mm );
				n++;
			}
		}
		Meld( std::to_string( n ) + " labels getekend." );
	}

	void Stempelen()
	{
		json p = LeesProject();
		if ( ! p.is_object() || p.empty() )
		{
			Meld( "Geen projectbestand gevonden." );
			return;
		}
		Undo undo( "Kabeltool: stempelen" );
		int n = 0, mis = 0;
		const json lijst = p.contains( "stempels" ) && p["stempels"].is_array() ? p["stempels"] : json::array();
		for ( const json& s : lijst )
		{
			MCObjectHandle h = gSDK->GetObjectByUuid( Tx( ::Tekst( s, "uuid" ) ) );
			if ( ! h || ! VWRecordObj::GetRecordObject( h, LD ) )
			{
				mis++;
				continue;
			}
			undo.VoorWijziging( h );
			ZetVeld( h, LD, "Circuit Name", ::Tekst( s, "circuitName" ) );
			ZetVeld( h, LD, "Circuit Number", ::Tekst( s, "circuitNumber" ) );
			ZetVeld( h, LD, "User Field 2", ::Tekst( s, "uf2" ) );
			ZetVeld( h, LD, "User Field 3", ::Tekst( s, "uf3" ) );
			gSDK->ResetObject( h );
			undo.NaWijziging( h );
			n++;
		}
		Meld( std::to_string( n ) + " lampen gestempeld" + ( mis ? ", " + std::to_string( mis ) + " niet gevonden." : "." ) );
	}

	// ---------------- demo-show
	int DemoLampen(const Drop& d, int aantal, const Inst& inst, Undo& undo)
	{
		MCObjectHandle laag = Laag( LAAG_LAMPEN );
		int gelukt = 0;
		for ( int i = 0; i < aantal; i++ )
		{
			double lx = ( d.x + ( i - ( aantal - 1 ) / 2.0 ) ) * MM, ly = ( d.y - 1.5 ) * MM;
			MCObjectHandle h = nullptr;
			try { h = gSDK->CreateCustomObject( Tx( LD ), WorldPt( lx, ly ), 0.0, true ); }
			catch ( ... ) { h = nullptr; }
			if ( ! h || ! VWRecordObj::GetRecordObject( h, LD ) )
			{
				if ( h ) gSDK->DeleteObject( h, false );
				continue;
			}
			ZetKlasse( h, inst.prefix + d.truss );
			NaarLaag( h, laag );
			ZetVeld( h, LD, "Inst Type", "Demo spot" );
			ZetVeld( h, LD, "Unit Number", d.id + "-" + std::to_string( i + 1 ) );
			gSDK->ResetObject( h );
			ZetVeld( h, LINK, "drop", d.id );
			undo.Nieuw( h );
			gelukt++;
		}
		return gelukt;
	}

	void DemoShow()
	{
		Inst inst = LeesInst();
		ZorgRecords();
		if ( ! Objecten( MetRecord( REC ) ).empty() )
		{
			Meld( "Deze tekening heeft al Kabeltool-objecten. Maak de demo-show in een nieuwe, lege tekening." );
			return;
		}
		Undo undo( "Kabeltool: demo-show" );

		MaakDimcity( 0, 0, inst, undo );
		MaakDimcity( 20, 0, inst, undo );

		// eerste punt = begin van de kabeltruss (aan de kant van de dim city)
		MaakTruss( "LX01", { { 4, 10, 8 }, { 16, 10, 8 } }, inst, undo );
		MaakTruss( "LX02", { { 16, 16, 8 }, { 4, 16, 8 } }, inst, undo );

		// vloerroutes van dim city naar de voet van de grote drop (begin van de truss)
		MaakVloer( { { 0, 0, 0 }, { 0, 10, 0 }, { 4, 10, 0 } }, inst.prefix + "DB1", inst, undo );
		MaakVloer( { { 20, 0, 0 }, { 20, 16, 0 }, { 16, 16, 0 } }, inst.prefix + "DB2", inst, undo );

		std::vector<Drop> drops;
		const double plekken[3][2] = { { 7, 10 }, { 13, 10 }, { 10, 16 } };
		for ( const auto& pl : plekken )
		{
			Drop d;
			if ( MaakDrop( pl[0], pl[1], inst, undo, d ) ) drops.push_back( d );
		}

		int lampen = 0;
		for ( const Drop& d : drops )
			lampen += DemoLampen( d, 4, inst, undo );

		if ( lampen )
			Meld( "Demo-show getekend: 2 dim cities, 2 trussen, 2 vloerroutes, " + std::to_string( drops.size() ) + " drops, " + std::to_string( lampen ) + " lampen." );
		else
			Meld( "Demo-show getekend: 2 dim cities, 2 trussen, 2 vloerroutes, " + std::to_string( drops.size() ) +
				  " drops. Lampen konden niet gemaakt worden (Spotlight); koppel zelf lampen met Lampen koppelen." );
	}

	// ---------------- tools (punten in meters)
	Punten PuntenUit(const json& a)
	{
		Punten pts;
		if ( a.is_object() && a.contains( "punten" ) && a["punten"].is_array() )
			for ( const json& p : a["punten"] )
				if ( p.is_array() && p.size() >= 2 )
					pts.push_back( { NaarGetal( p[0], 0 ), NaarGetal( p[1], 0 ), 0.0 } );
		return pts;
	}

	void ToolActie(const std::string& functie, const json& a)
	{
		Inst inst = LeesInst();
		ZorgRecords();
		if ( functie == "dimcity" )
		{
			Undo undo( "Kabeltool: dim city" );
			MaakDimcity( NaarGetal( a.value( "x", json( 0 ) ), 0 ), NaarGetal( a.value( "y", json( 0 ) ), 0 ), inst, undo );
		}
		else if ( functie == "drop" )
		{
			Undo undo( "Kabeltool: drop" );
			Drop d;
			MaakDrop( NaarGetal( a.value( "x", json( 0 ) ), 0 ), NaarGetal( a.value( "y", json( 0 ) ), 0 ), inst, undo, d );
		}
		else if ( functie == "vloer" )
		{
			Punten pts = PuntenUit( a );
			if ( pts.size() < 2 ) { Meld( "Klik minstens twee punten voor een vloerroute." ); return; }
			Undo undo( "Kabeltool: vloerroute" );
			MaakVloer( pts, ActieveKlasse(), inst, undo );
		}
		else if ( functie == "truss" )
		{
			Punten pts = PuntenUit( a );
			if ( pts.size() < 2 ) { Meld( "Klik minstens twee punten voor een truss-lijn (eerste punt = begin van de kabeltruss)." ); return; }
			std::string naam = ::Tekst( a, "naam" );
			while ( ! naam.empty() && naam.back() == ' ' ) naam.pop_back();
			if ( naam.empty() )
			{
				char buf[16];
				std::snprintf( buf, sizeof(buf), "LX%02d", Volgende( "truss", "T" ) );
				naam = buf;
			}
			double z = NaarGetal( a.value( "hoogte", json( 8 ) ), 8.0 );
			for ( P3& p : pts ) p[2] = z;
			Undo undo( "Kabeltool: truss-lijn" );
			MaakTruss( naam, pts, inst, undo );
		}
		else
			throw Stop{ "Onbekende tool: " + functie };
	}
}

// ------------------------------------------------------------------------------------------------------------
json Kabeltool::Voer(const std::string& functie, const json& args)
{
	gMeldingen.clear();
	json antwoord = { { "ok", false } };
	try
	{
		json data = true;
		if		( functie == "laad" )		data = Laad();
		else if ( functie == "bewaar" )		data = Bewaar( args );
		else if ( functie == "selectie" )	data = Selectie();
		else if ( functie == "selecteer" )	SelecteerId( ::Tekst( args, "id" ) );
		else if ( functie == "vloer" )		VloerVanSelectie();
		else if ( functie == "truss" )		TrussVanSelectie( args );
		else if ( functie == "lampen" )		LampenKoppelen();
		else if ( functie == "bijwerken" )	TekeningBijwerken();
		else if ( functie == "stempelen" )	Stempelen();
		else if ( functie == "demo" )		DemoShow();
		else throw Stop{ "Onbekende functie: " + functie };

		// na een actie die de tekening verandert: geometriebestand bijwerken
		if ( functie != "laad" && functie != "bewaar" && functie != "selectie" && functie != "selecteer" )
			Exporteer();

		antwoord = { { "ok", true }, { "data", data } };
	}
	catch ( const Stop& s )
	{
		antwoord = { { "ok", false }, { "fout", s.tekst } };
	}
	catch ( const std::exception& e )
	{
		antwoord = { { "ok", false }, { "fout", std::string( "Interne fout: " ) + e.what() } };
	}
	catch ( ... )
	{
		antwoord = { { "ok", false }, { "fout", "Onbekende interne fout." } };
	}
	antwoord["meldingen"] = gMeldingen;
	if ( ! antwoord["ok"].get<bool>() )
		Log( "Voer " + functie + " fout: " + antwoord.value( "fout", std::string() ) );
	return antwoord;
}

void Kabeltool::ToolUit(const std::string& functie, const json& args)
{
	gMeldingen.clear();
	std::string fout;
	try
	{
		ToolActie( functie, args );
		Exporteer();
	}
	catch ( const Stop& s )					{ fout = s.tekst; }
	catch ( const std::exception& e )		{ fout = std::string( "Interne fout: " ) + e.what(); }
	catch ( ... )							{ fout = "Onbekende interne fout."; }

	if ( ! fout.empty() )
	{
		Log( "Tool " + functie + " fout: " + fout );
		gMeldingen.push_back( fout );
	}
	if ( ! gMeldingen.empty() )
	{
		std::string tekst;
		for ( const std::string& m : gMeldingen ) tekst += ( tekst.empty() ? "" : "\n" ) + m;
		gSDK->AlertInform( Tx( "Kabeltool" ), Tx( tekst ) );
	}
}
