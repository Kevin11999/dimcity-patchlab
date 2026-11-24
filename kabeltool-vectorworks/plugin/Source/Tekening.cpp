#include "StdAfx.h"

#include <algorithm>
#include <array>
#include <cctype>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <fstream>
#include <functional>
#include <map>
#include <unordered_map>
#include <memory>
#include <sstream>
#include <string>
#include <vector>

#include "Kabeltool.h"
#include "Objecten.h"
#include "Tekening.h"

// Kabeltool – Vectorworks-kant in C++ (geen Python). Werkt met de eigen objecten uit Objecten.cpp:
// KT_DimCity, KT_Drop, KT_Kabelroute, KT_Kabellabel, KT_Kabel.
//
// Bestanden naast de tekening (zelfde naam als de .vwx):
//   <naam>.kt-tekening.json   geometrie (ook rechtstreeks naar de palette via "laad")
//   <naam>.kt-project.json    geschreven door de palette (instellingen, nummers, labels, kabelpaden, stempels)

using namespace Kabeltool;
using json = nlohmann::json;

namespace
{
	const char* LINK	= "KT_Link";			// op lampen: bij welke drop ze horen
	const char* LD		= "Lighting Device";
	
	const double MM = 1000.0;					// millimeter per meter (interne eenheid van Vectorworks)

	typedef std::array<double, 3>	P3;			// punt in meters
	typedef std::vector<P3>			Punten;

	// --------------------------------------------------------------------------------------------------------
	std::vector<std::string> gMeldingen;
	void Meld(const std::string& tekst) { gMeldingen.push_back( tekst ); }

	struct Stop { std::string tekst; };			// fout die de actie netjes afbreekt

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
		~Undo()										{ gSDK->EndUndoEvent(); }
		void Nieuw(MCObjectHandle h)				{ if ( h ) gSDK->AddAfterSwapObject( h ); }
		void VoorWijziging(MCObjectHandle h)		{ if ( h ) gSDK->AddBeforeSwapObject( h ); }
		void NaWijziging(MCObjectHandle h)			{ if ( h ) gSDK->AddAfterSwapObject( h ); }
		void Weg(MCObjectHandle h)
		{
			if ( ! h ) return;
			gSDK->AddBeforeSwapObject( h );
			gSDK->DeleteObject( h, false );
		}
	};

	// --------------------------------------------------------------------------------------------------------
	// Tekst en getallen
	std::string Std(const TXString& s)		{ return s.GetStdString(); }
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

	double Num(const json& o, const char* sleutel, double standaard)
	{
		return ( o.is_object() && o.contains( sleutel ) ) ? NaarGetal( o[sleutel], standaard ) : standaard;
	}

	std::string Klein(std::string s)
	{
		for ( char& c : s ) c = (char) std::tolower( (unsigned char) c );
		return s;
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

	void SchrijfJson(const std::string& pad, const json& j, int inspringen = 1)
	{
		std::ofstream f( Wide( pad ), std::ios::binary | std::ios::trunc );
		f << j.dump( inspringen );
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

	json LeesProject() { return LeesJson( BasisVerplicht() + ".kt-project.json" ); }

	// Instellingen: standaard + wat de palette in het projectbestand heeft gezet.
	// Tekeningstructuur (Kevin): PP Lichtplot (lampen), PP Infra (infra, blokken, drops), PP Cables (kabels).
	// Classes zijn objectnamen zonder prefix (LX1, CB01, DB1).
	struct Inst
	{
		std::string prefix		= "";
		double symboolBreedte	= 12.7;
		double symboolHoogte	= 4;
		double dimcityMaat		= 1;
		double dimcityKast		= 2;
		double dropSymbool		= 0.3;
		std::string kleurDB		= "#ff0000";
		std::string kleurDrop	= "#33cc00";
		std::string laagCabling	= "PP Cables";
		std::string laagInfra	= "PP Infra";
		std::string laagKabels	= "PP Cables";
		std::string laagLampen	= "PP Lichtplot";
		std::string trussWoorden = "truss, h30, h40, x30, x40, f23, f24, f32, f33, f34, f44, f52, b100, prolyte, litec, eurotruss, global truss, milos, tomcat, ladder";
		std::string weergave3D	= "echt";		// "echt" = vorm uit Vectorworks, "basis" = eenvoudige blokken
		std::string dropVorm	= "Boog";
		bool markeringen		= false;		// waarschuwingen ook als markering in de tekening
		bool kabels3D			= true;
		bool kabels2D			= true;
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
			inst.laagKabels		= Tekst( s, "laagKabels", inst.laagCabling );
			inst.laagLampen		= Tekst( s, "laagLampen", inst.laagLampen );
			inst.trussWoorden	= Tekst( s, "trussWoorden", inst.trussWoorden );
			inst.weergave3D		= Tekst( s, "weergave3D", inst.weergave3D );
			inst.dropVorm		= Tekst( s, "dropVorm", inst.dropVorm );
			inst.symboolBreedte	= Num( s, "symboolBreedte", inst.symboolBreedte );
			inst.symboolHoogte	= Num( s, "symboolHoogte", inst.symboolHoogte );
			inst.dimcityMaat	= Num( s, "dimcityMaat", inst.dimcityMaat );
			inst.dimcityKast	= Num( s, "dimcityKast", inst.dimcityKast );
			inst.dropSymbool	= Num( s, "dropSymbool", inst.dropSymbool );
			inst.kleurDB		= Tekst( s, "kleurDB", inst.kleurDB );
			inst.kleurDrop		= Tekst( s, "kleurDrop", inst.kleurDrop );
			if ( s.contains( "kabels3D" ) && s["kabels3D"].is_boolean() ) inst.kabels3D = s["kabels3D"].get<bool>();
			if ( s.contains( "kabels2D" ) && s["kabels2D"].is_boolean() ) inst.kabels2D = s["kabels2D"].get<bool>();
			if ( s.contains( "markeringen" ) && s["markeringen"].is_boolean() ) inst.markeringen = s["markeringen"].get<bool>();
		}
		if ( inst.laagCabling.empty() )	inst.laagCabling = "PP Cables";
		if ( inst.laagInfra.empty() )	inst.laagInfra = "PP Infra";
		if ( inst.laagKabels.empty() )	inst.laagKabels = inst.laagCabling;
		if ( inst.laagLampen.empty() )	inst.laagLampen = "PP Lichtplot";
		if ( inst.symboolBreedte <= 0 )	inst.symboolBreedte = 12.7;
		if ( inst.symboolHoogte <= 0 )	inst.symboolHoogte = 4;
		if ( inst.dimcityMaat <= 0 )	inst.dimcityMaat = 1;
		if ( inst.dimcityKast < 0 )		inst.dimcityKast = 0;
		if ( inst.dropSymbool <= 0 )	inst.dropSymbool = 0.3;
		if ( inst.dropVorm != "Recht" && inst.dropVorm != "Realistisch" ) inst.dropVorm = "Boog";
		return inst;
	}

	// Lijst "a, b, c" -> kleine letters, zonder spaties eromheen
	std::vector<std::string> Woorden(const std::string& lijst)
	{
		std::vector<std::string> uit;
		std::string w;
		auto klaar = [&]() {
			while ( ! w.empty() && w.back() == ' ' ) w.pop_back();
			size_t b = w.find_first_not_of( ' ' );
			if ( b != std::string::npos ) uit.push_back( Klein( w.substr( b ) ) );
			w.clear();
		};
		for ( char c : lijst ) { if ( c == ',' || c == ';' || c == '\n' ) klaar(); else w += c; }
		klaar();
		return uit;
	}

	// --------------------------------------------------------------------------------------------------------
	// Records (alleen nog voor de koppeling lamp ↔ drop en de Spotlight-velden)
	void ZorgRecord(const char* naam, const std::vector<const char*>& velden)
	{
		MCObjectHandle h = gSDK->GetNamedObject( naam );
		if ( ! h )
		{
			TFormatHandler maak( Tx( naam ) );
			h = gSDK->GetNamedObject( naam );
		}
		if ( ! h || ! VWRecordFormatObj::IsRecordFormatObject( h ) )
			throw Stop{ std::string( "Recordformaat " ) + naam + " kon niet gemaakt worden (bestaat de naam al voor iets anders?)." };
		VWRecordFormatObj fmt( h );
		for ( const char* veld : velden )
			if ( fmt.GetParamIndex( veld ) == size_t(-1) )
				fmt.AddParamString( veld, "" );
	}

	void ZorgRecords() { ZorgRecord( LINK, { "drop" } ); }

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

	// --------------------------------------------------------------------------------------------------------
	// Parameters van de eigen objecten
	std::string Par(MCObjectHandle h, const char* naam)
	{
		try { return Std( VWParametricObj( h ).GetParamString( naam ) ); }
		catch ( ... ) { return ""; }
	}
	double ParReal(MCObjectHandle h, const char* naam, double standaard)
	{
		try { return VWParametricObj( h ).GetParamReal( naam ); }
		catch ( ... ) { return standaard; }
	}
	void ZetPar(MCObjectHandle h, const char* naam, const std::string& waarde)
	{
		try { VWParametricObj( h ).SetParamString( naam, Tx( waarde ) ); }
		catch ( ... ) {}
	}
	void ZetParReal(MCObjectHandle h, const char* naam, double waarde)
	{
		try { VWParametricObj( h ).SetParamReal( naam, waarde ); }
		catch ( ... ) {}
	}
	void ZetParBool(MCObjectHandle h, const char* naam, bool waarde)
	{
		try { VWParametricObj( h ).SetParamBool( naam, waarde ); }
		catch ( ... ) {}
	}

	// --------------------------------------------------------------------------------------------------------
	// Objecten zoeken
	std::vector<MCObjectHandle> Objecten(const std::string& criteria)
	{
		std::vector<MCObjectHandle> lijst;
		gSDK->ForEachObjectInCriteria( Tx( criteria ), [&](MCObjectHandle h) { if ( h ) lijst.push_back( h ); } );
		return lijst;
	}

	std::string Pon(const char* naam)		{ return std::string( "(PON='" ) + naam + "')"; }
	std::string MetRecord(const char* rec)	{ return std::string( "(R IN ['" ) + rec + "'])"; }

	bool IsKt(MCObjectHandle h)
	{
		for ( const char* n : { KT_DIMCITY, KT_DROP, KT_ROUTE, KT_LABEL, KT_KABEL, KT_DOEL } )
			if ( VWParametricObj::IsParametricObject( h, n ) ) return true;
		return false;
	}

	int Volgende(const char* pon, const std::string& letter)
	{
		int hoogste = 0;
		for ( MCObjectHandle h : Objecten( Pon( pon ) ) )
		{
			std::string id = Par( h, "ktId" );
			if ( id.size() <= letter.size() || id.compare( 0, letter.size(), letter ) != 0 ) continue;
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
		VWClass klasse( Tx( naam ) );
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

	std::string LaagNaam(MCObjectHandle h)
	{
		try { return Std( VWLayerObj( h ).GetName() ); }
		catch ( ... ) { return ""; }
	}

	// Ontwerplaag op naam zoeken (hoofdletters maken niet uit). GetNamedObject vindt geen lagen.
	MCObjectHandle ZoekLaag(const std::string& naam)
	{
		MCObjectHandle gevonden = nullptr;
		std::string doel = Klein( naam );
		gSDK->ForEachLayerN( [&](MCObjectHandle h) {
			if ( gevonden || ! h ) return;
			if ( Klein( LaagNaam( h ) ) == doel ) gevonden = h;
		} );
		return gevonden;
	}

	// Bestaande laag gebruiken; alleen als die er echt niet is een nieuwe maken (de actieve laag blijft actief)
	MCObjectHandle Laag(const std::string& naam)
	{
		MCObjectHandle h = ZoekLaag( naam );
		if ( h ) return h;
		MCObjectHandle actief = gSDK->GetActiveLayer();
		h = gSDK->CreateLayer( Tx( naam ), kLayerDesign );
		if ( ! h )
			throw Stop{ "Laag '" + naam + "' kon niet gemaakt worden." };
		if ( actief && actief != h ) gSDK->SetCurrentLayer( actief );
		return h;
	}

	void NaarLaag(MCObjectHandle h, MCObjectHandle laag)
	{
		if ( h && laag && gSDK->ParentObject( h ) != laag )
			gSDK->AddObjectToContainer( h, laag );
	}

	std::string LaagVan(MCObjectHandle h)
	{
		try
		{
			MCObjectHandle l = VWObject( h ).GetParentLayer();
			return l ? LaagNaam( l ) : "";
		}
		catch ( ... ) { return ""; }
	}

	// Lagen opruimen: door de oude fout zijn er lagen als "Cabling-2", "Infraplot-5" en "Lightplot-3" gemaakt.
	// Alles wat daarop staat gaat terug naar de echte laag; de lege extra laag verdwijnt.
	void LagenOpruimen(const std::vector<std::string>& basissen)
	{
		struct Extra { MCObjectHandle h; std::string basis; };
		std::vector<Extra> extra;
		gSDK->ForEachLayerN( [&](MCObjectHandle h) {
			if ( ! h ) return;
			try { if ( VWLayerObj( h ).GetLayerType() != kLayerDesign ) return; } catch ( ... ) { return; }
			std::string naam = LaagNaam( h );
			for ( const std::string& b : basissen )
			{
				if ( b.empty() || naam.size() < b.size() + 2 ) continue;
				if ( Klein( naam.substr( 0, b.size() ) ) != Klein( b ) || naam[b.size()] != '-' ) continue;
				std::string rest = naam.substr( b.size() + 1 );
				if ( rest.empty() || ! std::all_of( rest.begin(), rest.end(), [](char c) { return c >= '0' && c <= '9'; } ) ) continue;
				extra.push_back( { h, b } );
				break;
			}
		} );
		if ( extra.empty() )
		{
			Meld( "Er zijn geen extra lagen om op te ruimen." );
			return;
		}

		int verplaatst = 0, weg = 0, bleef = 0;
		MCObjectHandle actief = gSDK->GetActiveLayer();
		for ( const Extra& e : extra )
		{
			MCObjectHandle doel = Laag( e.basis );
			std::vector<MCObjectHandle> inhoud;
			for ( MCObjectHandle o = gSDK->FirstMemberObj( e.h ); o; o = gSDK->NextObject( o ) )
				inhoud.push_back( o );
			for ( MCObjectHandle o : inhoud )
			{
				gSDK->AddObjectToContainer( o, doel );
				verplaatst++;
			}
			if ( actief == e.h ) { gSDK->SetCurrentLayer( doel ); actief = doel; }
			if ( gSDK->FirstMemberObj( e.h ) ) { bleef++; continue; }
			gSDK->DeleteObject( e.h, false );
			weg++;
		}
		gSDK->ClearUndoTableDueToUnsupportedAction();
		Meld( std::to_string( verplaatst ) + " objecten teruggezet, " + std::to_string( weg ) + " extra lagen verwijderd"
			  + ( bleef ? ", " + std::to_string( bleef ) + " lagen niet leeg (blijven staan)." : "." ) );
	}

	std::string ZonderPrefix(const std::string& klasse, const std::string& prefix)
	{
		if ( ! prefix.empty() && klasse.compare( 0, prefix.size(), prefix ) == 0 )
			return klasse.substr( prefix.size() );
		return klasse;
	}

	// --------------------------------------------------------------------------------------------------------
	// Geometrie (meters)
	P3 Positie(MCObjectHandle h)
	{
		TransformMatrix m;
		gSDK->GetEntityMatrix( h, m );
		VWTransformMatrix vm( m );
		VWPoint3D o = vm.GetOffset();
		return { o.x / MM, o.y / MM, o.z / MM };
	}

	// Punten van een losse lijn / polygoon / polylijn / 3D-polygoon (voor "van selectie")
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

	// Punten van een KT_Kabelroute in wereldcoördinaten; z = hoogte bij een truss-lijn
	Punten RoutePunten(MCObjectHandle h)
	{
		Punten pts;
		MCObjectHandle hp = gSDK->GetCustomObjectPath( h );
		if ( ! hp ) return pts;
		short t = gSDK->GetObjectTypeN( hp );
		if ( t != kPolygonNode && t != kPolylineNode ) return pts;

		TransformMatrix m;
		gSDK->GetEntityMatrix( h, m );
		VWTransformMatrix vm( m );
		bool truss = Par( h, "soort" ) == "Truss";
		double z = truss ? ParReal( h, "hoogte", 8 ) : 0.0;

		VWPolygon2DObj pad( hp );
		for ( size_t i = 0; i < pad.GetVertexCount(); i++ )
		{
			VWPoint2D q = pad.GetVertexPoint( i );
			VWPoint3D w = vm.PointTransform( VWPoint3D( q.x, q.y, 0 ) );
			pts.push_back( { w.x / MM, w.y / MM, z } );
		}
		return pts;
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
		for ( MCObjectHandle h : Objecten( Pon( KT_ROUTE ) ) )
			if ( Par( h, "soort" ) == "Truss" )
				lijst.push_back( { h, Par( h, "ktId" ), Par( h, "naam" ), RoutePunten( h ) } );
		return lijst;
	}

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
	// Eigen objecten maken (meters)
	MCObjectHandle Afmaken(MCObjectHandle h, const std::string& klasse, MCObjectHandle laag, Undo& undo)
	{
		ZetKlasse( h, klasse );
		NaarLaag( h, laag );
		gSDK->ResetObject( h );
		undo.Nieuw( h );
		return h;
	}

	MCObjectHandle MaakPunt(const char* pon, double x, double y)
	{
		VWParametricObj o( Tx( pon ), VWPoint2D( x * MM, y * MM ), 0.0 );
		MCObjectHandle h = o.GetThisObject();
		if ( ! h ) throw Stop{ std::string( "Object " ) + pon + " kon niet gemaakt worden. Staat de plug-in goed in de Plug-ins-map?" };
		return h;
	}

	MCObjectHandle MaakPad2D(const char* pon, const Punten& pts)
	{
		VWPolygon2DObj pad;
		for ( const P3& q : pts ) pad.AddCornerVertex( q[0] * MM, q[1] * MM );
		pad.SetClosed( false );
		VWParametricObj o( Tx( pon ), pad.GetThisObject() );
		MCObjectHandle h = o.GetThisObject();
		if ( ! h ) throw Stop{ std::string( "Object " ) + pon + " kon niet gemaakt worden." };
		return h;
	}

	MCObjectHandle MaakPad3D(const char* pon, const Punten& pts)
	{
		VWPolygon3DObj pad;
		for ( const P3& q : pts ) pad.AddVertex( q[0] * MM, q[1] * MM, q[2] * MM );
		pad.SetClosed( false );
		VWParametricObj o( Tx( pon ), pad.GetThisObject() );
		MCObjectHandle h = o.GetThisObject();
		if ( ! h ) throw Stop{ std::string( "Object " ) + pon + " kon niet gemaakt worden." };
		return h;
	}

	std::string MaakDimcity(double x, double y, const Inst& inst, Undo& undo)
	{
		std::string naam = "DB" + std::to_string( Volgende( KT_DIMCITY, "DB" ) );
		MCObjectHandle h = MaakPunt( KT_DIMCITY, x, y );
		ZetPar( h, "ktId", naam );
		ZetPar( h, "naam", naam );
		ZetParReal( h, "maat", inst.dimcityMaat );
		ZetParReal( h, "kastHoogte", inst.dimcityKast );
		ZetPar( h, "kleur", inst.kleurDB );
		Afmaken( h, inst.prefix + naam, Laag( inst.laagInfra ), undo );
		return naam;
	}

	void MaakRoute(const Punten& pts, bool truss, const std::string& naam, double hoogte, const std::string& klasse,
				   const std::string& laag, Undo& undo)
	{
		std::string id = truss ? "T" + std::to_string( Volgende( KT_ROUTE, "T" ) ) : "V" + std::to_string( Volgende( KT_ROUTE, "V" ) );
		MCObjectHandle h = MaakPad2D( KT_ROUTE, pts );
		ZetPar( h, "ktId", id );
		ZetPar( h, "soort", truss ? "Truss" : "Vloer" );
		ZetPar( h, "naam", naam );
		ZetParReal( h, "hoogte", hoogte );
		Afmaken( h, klasse, Laag( laag ), undo );
	}

	std::string TrussNaam(const std::string& naam)
	{
		if ( ! naam.empty() ) return naam;
		char buf[16];
		std::snprintf( buf, sizeof(buf), "LX%02d", Volgende( KT_ROUTE, "T" ) );
		return buf;
	}

	struct Drop
	{
		std::string id, trussNaam, doelKlasse;
		double x, y, z;
		double doelX, doelY;
	};

	// ---------------- blokken (multi/SOCA/LK/VEAM) in PP Infra: het nummer is leidend
	// Nummer: M101, LK101 (ook L101), V101 (ook VEAM101), D101. Poortnummers (LK101.5) zijn geen blok.
	struct Nummer { std::string voorv; int getal = 0; std::string tekst; };

	bool LeesNummer(const std::string& tekst, Nummer& uit)
	{
		std::string woord;
		auto test = [&](std::string w) -> bool {
			for ( char& c : w ) c = (char) std::toupper( (unsigned char) c );
			static const char* lijst[] = { "VEAM", "LK", "M", "L", "V", "D" };
			for ( const char* v : lijst )
			{
				size_t n = std::strlen( v );
				if ( w.size() <= n || w.compare( 0, n, v ) != 0 ) continue;
				std::string rest = w.substr( n );
				if ( ! rest.empty() && rest[0] == '-' ) rest.erase( 0, 1 );
				if ( rest.empty() || rest.size() > 4 || ! std::all_of( rest.begin(), rest.end(), [](char c) { return c >= '0' && c <= '9'; } ) ) continue;
				std::string vv = v;
				if ( vv == "L" ) vv = "LK";
				if ( vv == "VEAM" ) vv = "V";
				uit.voorv = vv;
				uit.getal = std::stoi( rest );
				uit.tekst = vv + std::to_string( uit.getal );
				return uit.getal > 0;
			}
			return false;
		};
		for ( char c : tekst + " " )
		{
			if ( std::isalnum( (unsigned char) c ) || c == '-' || c == '.' ) { woord += c; continue; }
			if ( ! woord.empty() && woord.find( '.' ) == std::string::npos && test( woord ) ) return true;
			woord.clear();
		}
		return false;
	}

	// Alle teksten in een symbooldefinitie of groep (ook in groepen daarbinnen)
	void TekstenIn(MCObjectHandle houder, std::vector<std::string>& uit, int diepte = 0)
	{
		if ( ! houder || diepte > 6 ) return;
		for ( MCObjectHandle o = gSDK->FirstMemberObj( houder ); o; o = gSDK->NextObject( o ) )
		{
			short t = gSDK->GetObjectTypeN( o );
			if ( t == kTextNode ) uit.push_back( Std( gSDK->GetTextChars( o ) ) );
			else if ( t == kGroupNode ) TekstenIn( o, uit, diepte + 1 );
		}
	}

	// Waarden van alle records aan een object
	void RecordWaarden(MCObjectHandle h, std::vector<std::string>& uit)
	{
		try
		{
			VWObject obj( h );
			MCObjectHandle r = obj.FindAuxObject( kRecordNode );
			int veilig = 0;
			while ( r && veilig++ < 64 )
			{
				if ( VWRecordObj::IsRecordObject( r ) )
				{
					VWRecordObj rec( r );
					for ( size_t i = 0; i < rec.GetParamsCount() && i < 200; i++ )
						uit.push_back( Std( rec.GetParamValue( rec.GetParamName( i ) ) ) );
				}
				r = obj.FindAuxObject( kRecordNode, r );
			}
		}
		catch ( ... ) {}
	}

	std::vector<std::string> RecordNamen(MCObjectHandle h)
	{
		std::vector<std::string> uit;
		try
		{
			VWObject obj( h );
			MCObjectHandle r = obj.FindAuxObject( kRecordNode );
			int veilig = 0;
			while ( r && veilig++ < 64 )
			{
				if ( VWRecordObj::IsRecordObject( r ) ) uit.push_back( Std( VWRecordObj( r ).GetRecordName() ) );
				r = obj.FindAuxObject( kRecordNode, r );
			}
		}
		catch ( ... ) {}
		return uit;
	}

	std::string ObjectNaam(MCObjectHandle h)
	{
		TXString n;
		gSDK->GetObjectName( h, n );
		return Std( n );
	}

	std::string SymboolNaam(MCObjectHandle h)
	{
		if ( gSDK->GetObjectTypeN( h ) != kSymbolNode ) return "";
		MCObjectHandle def = gSDK->GetDefinition( h );
		return def ? ObjectNaam( def ) : "";
	}

	// Map in het hulpbronnenbeheer waar de symbooldefinitie in staat (leeg als geen map)
	std::string SymboolMap(MCObjectHandle h)
	{
		if ( gSDK->GetObjectTypeN( h ) != kSymbolNode ) return "";
		MCObjectHandle def = gSDK->GetDefinition( h );
		std::string pad;
		MCObjectHandle p = def ? gSDK->ParentObject( def ) : nullptr;
		int veilig = 0;
		while ( p && gSDK->GetObjectTypeN( p ) == kFolderNode && veilig++ < 10 )
		{
			std::string n = ObjectNaam( p );
			pad = n + ( pad.empty() ? "" : "/" + pad );
			p = gSDK->ParentObject( p );
		}
		return pad;
	}

	struct Blok
	{
		MCObjectHandle	h = nullptr;
		std::string		uuid, klasse, laag, symbool, bron, type;
		Nummer			nr;
		P3				mn = { 0, 0, 0 }, mx = { 0, 0, 0 };
	};

	bool Kubus(MCObjectHandle h, P3& mn, P3& mx);
	std::string NaamVanSoort(MCObjectHandle h);

	// Soort kabel bij het nummer: M (en D) = multi (Socapex, of Harting als de symboolnaam dat zegt), LK = V12, V = V4
	std::string KabelType(const Nummer& n, const std::string& symbool)
	{
		if ( n.voorv == "LK" ) return "lk";
		if ( n.voorv == "V" ) return "veam";
		std::string s = Klein( symbool );
		if ( s.find( "hart" ) != std::string::npos ) return "harting";
		return "socapex";
	}

	// Alle blokken op de infra-laag. Bron van het nummer: record, naam, tekst in het symbool/de groep,
	// of een losse tekst bij het blok (zelfde class). Een losse tekst zonder blok in de buurt telt zelf als blok.
	std::vector<Blok> Blokken(const Inst& inst)
	{
		std::vector<Blok> blokken;
		MCObjectHandle laag = ZoekLaag( inst.laagInfra );
		if ( ! laag ) return blokken;

		struct Los { MCObjectHandle h; std::string klasse; Nummer nr; P3 mn, mx; bool gebruikt = false; };
		std::vector<Los> losse;
		std::vector<MCObjectHandle> kandidaten;
		for ( MCObjectHandle o = gSDK->FirstMemberObj( laag ); o; o = gSDK->NextObject( o ) )
		{
			short t = gSDK->GetObjectTypeN( o );
			if ( t == kTextNode )
			{
				Los l;
				if ( ! LeesNummer( Std( gSDK->GetTextChars( o ) ), l.nr ) ) continue;
				if ( ! Kubus( o, l.mn, l.mx ) ) continue;
				l.h = o; l.klasse = KlasseVan( o );
				losse.push_back( l );
			}
			else if ( t == kSymbolNode || t == kGroupNode || ( t == kParametricNode && ! IsKt( o ) ) )
				kandidaten.push_back( o );
		}

		for ( MCObjectHandle h : kandidaten )
		{
			Blok b;
			b.h = h;
			if ( ! Kubus( h, b.mn, b.mx ) ) continue;
			b.klasse = KlasseVan( h );
			b.symbool = gSDK->GetObjectTypeN( h ) == kSymbolNode ? SymboolNaam( h ) : NaamVanSoort( h );
			std::vector<std::string> recs, teksten;
			RecordWaarden( h, recs );
			bool ok = false;
			for ( const std::string& w : recs ) if ( ( ok = LeesNummer( w, b.nr ) ) ) { b.bron = "record"; break; }
			if ( ! ok && LeesNummer( ObjectNaam( h ), b.nr ) ) { ok = true; b.bron = "naam"; }
			if ( ! ok )
			{
				short t = gSDK->GetObjectTypeN( h );
				if ( t == kSymbolNode ) TekstenIn( gSDK->GetDefinition( h ), teksten );
				else if ( t == kGroupNode ) TekstenIn( h, teksten );
				for ( const std::string& w : teksten ) if ( ( ok = LeesNummer( w, b.nr ) ) ) { b.bron = "tekst"; break; }
			}
			if ( ! ok )
			{
				// losse tekst bij het blok in dezelfde class
				double marge = std::max( 0.4, std::max( b.mx[0] - b.mn[0], b.mx[1] - b.mn[1] ) * 0.6 );
				Los* best = nullptr;
				double bestD = 1e300;
				for ( Los& l : losse )
				{
					if ( l.gebruikt || l.klasse != b.klasse ) continue;
					double cx = ( l.mn[0] + l.mx[0] ) / 2, cy = ( l.mn[1] + l.mx[1] ) / 2;
					double dx = std::max( { b.mn[0] - cx, 0.0, cx - b.mx[0] } ), dy = std::max( { b.mn[1] - cy, 0.0, cy - b.mx[1] } );
					double d = std::hypot( dx, dy );
					if ( d <= marge && d < bestD ) { best = &l; bestD = d; }
				}
				if ( best ) { best->gebruikt = true; b.nr = best->nr; ok = true; b.bron = "losse tekst"; }
			}
			if ( ! ok ) continue;
			b.uuid = Uuid( h );
			b.laag = inst.laagInfra;
			b.type = KabelType( b.nr, b.symbool );
			blokken.push_back( b );
		}
		for ( Los& l : losse )
		{
			if ( l.gebruikt ) continue;
			Blok b;
			b.h = l.h; b.nr = l.nr; b.klasse = l.klasse; b.mn = l.mn; b.mx = l.mx;
			b.uuid = Uuid( l.h ); b.laag = inst.laagInfra; b.bron = "losse tekst"; b.type = KabelType( b.nr, "" );
			blokken.push_back( b );
		}
		return blokken;
	}

	json BlokkenJson(const std::vector<Blok>& blokken)
	{
		json a = json::array();
		for ( const Blok& b : blokken )
			a.push_back( { { "uuid", b.uuid }, { "klasse", b.klasse }, { "laag", b.laag }, { "symbool", b.symbool }, { "bron", b.bron },
						   { "nummer", b.nr.tekst }, { "voorv", b.nr.voorv }, { "getal", b.nr.getal }, { "type", b.type },
						   { "x", ( b.mn[0] + b.mx[0] ) / 2 }, { "y", ( b.mn[1] + b.mx[1] ) / 2 }, { "z", ( b.mn[2] + b.mx[2] ) / 2 } } );
		return a;
	}

	// Dim city bij een bloknummer: M101 -> 1, M201 -> 2; met één dim city altijd 1
	int DimcityVanNummer(int getal, int aantalDc)
	{
		if ( aantalDc <= 1 ) return 1;
		return getal >= 100 ? getal / 100 : 1;
	}

	// Volgend vrij dropnummer: D101, D102 … per dim city; met één dim city D1, D2 …
	std::string VolgendeDrop(int dcNr, int aantalDc)
	{
		int basis = aantalDc > 1 ? dcNr * 100 : 0;
		int hoogste = basis;
		for ( MCObjectHandle h : Objecten( Pon( KT_DROP ) ) )
		{
			std::string id = Par( h, "ktId" );
			if ( id.size() < 2 || id[0] != 'D' ) continue;
			int n = 0;
			try { n = std::stoi( id.substr( 1 ) ); } catch ( ... ) { continue; }
			if ( n > basis && n < basis + 100 ) hoogste = std::max( hoogste, n );
		}
		return "D" + std::to_string( hoogste + 1 );
	}

	// Dichtstbijzijnde truss-lijn met punt, richting en afstand langs de lijn
	struct Snap
	{
		const Truss* t = nullptr;
		double d = 0, langs = 0;
		P3 q = { 0, 0, 0 };
		double rx = 1, ry = 0;
	};

	Snap SnapOp(const std::vector<Truss>& trussen, double px, double py)
	{
		Snap best;
		for ( const Truss& t : trussen )
		{
			double cum = 0;
			for ( size_t i = 0; i + 1 < t.punten.size(); i++ )
			{
				const P3& a = t.punten[i];
				const P3& b = t.punten[i + 1];
				double vx = b[0] - a[0], vy = b[1] - a[1], l2 = vx * vx + vy * vy, L = std::sqrt( l2 );
				double f = l2 > 0 ? ( ( px - a[0] ) * vx + ( py - a[1] ) * vy ) / l2 : 0.0;
				f = std::max( 0.0, std::min( 1.0, f ) );
				P3 p = { a[0] + vx * f, a[1] + vy * f, a[2] + ( b[2] - a[2] ) * f };
				double d = std::hypot( p[0] - px, p[1] - py );
				if ( ! best.t || d < best.d )
				{
					best.t = &t; best.d = d; best.q = p; best.langs = cum + L * f;
					best.rx = L > 0 ? vx / L : 1; best.ry = L > 0 ? vy / L : 0;
				}
				cum += L;
			}
		}
		return best;
	}

	// Kant van de truss waar de kabels zakken: links of rechts van de looprichting van de truss-lijn
	std::string KantVan(const Snap& s, double px, double py)
	{
		double k = s.rx * ( py - s.q[1] ) - s.ry * ( px - s.q[0] );
		return k >= 0 ? "L" : "R";
	}

	bool MaakDrop(double x1, double y1, double x2, double y2, bool metDoel, const std::string& doelKlasse, const std::string& vorm,
				  const Inst& inst, Undo& undo, Drop& uit, const std::string& kantGegeven = "")
	{
		std::vector<Truss> trussen = Trussen();
		Snap s = SnapOp( trussen, x1, y1 );
		if ( ! s.t )
		{
			Meld( "Er is nog geen truss-lijn. Teken eerst de truss-lijn van de kabeltruss (tool Truss-lijn)." );
			return false;
		}
		std::string kant = kantGegeven.empty() ? KantVan( s, x1, y1 ) : kantGegeven;

		// dim city uit het nummer van de blokken bij het doel
		int aantalDc = (int) Objecten( Pon( KT_DIMCITY ) ).size();
		int dcNr = 1;
		std::string blokNrs;
		if ( metDoel )
		{
			bool eerste = true;
			for ( const Blok& b : Blokken( inst ) )
			{
				if ( b.klasse != doelKlasse ) continue;
				if ( eerste ) dcNr = DimcityVanNummer( b.nr.getal, aantalDc );
				eerste = false;
				blokNrs += ( blokNrs.empty() ? "" : ", " ) + b.nr.tekst;
			}
			if ( blokNrs.empty() )
				Meld( "Geen multi-, SOCA-, LK- of VEAM-blok met nummer gevonden in class " + doelKlasse + " op laag " + inst.laagInfra + "." );
		}

		uit.id = VolgendeDrop( dcNr, aantalDc );
		uit.trussNaam = s.t->naam;
		uit.doelKlasse = doelKlasse;
		uit.x = s.q[0]; uit.y = s.q[1]; uit.z = s.q[2];
		uit.doelX = x2; uit.doelY = y2;

		MCObjectHandle h = MaakPunt( KT_DROP, s.q[0], s.q[1] );
		ZetPar( h, "ktId", uit.id );
		ZetPar( h, "truss", s.t->id );
		ZetParReal( h, "z", s.q[2] );
		ZetParReal( h, "symboolMaat", inst.dropSymbool );
		ZetPar( h, "kleur", inst.kleurDrop );
		ZetPar( h, "kant", kant );
		ZetParReal( h, "richting", std::atan2( s.ry, s.rx ) * 180.0 / 3.14159265358979 );
		ZetPar( h, "vorm", vorm.empty() ? inst.dropVorm : vorm );
		ZetParReal( h, "droplengte", 0 );
		if ( metDoel )
		{
			ZetPar( h, "objectnaam", doelKlasse );
			ZetPar( h, "doelKlasse", doelKlasse );
		}
		Afmaken( h, inst.prefix + s.t->naam, Laag( inst.laagInfra ), undo );

		if ( metDoel )
		{
			MCObjectHandle d = MaakPunt( KT_DOEL, x2, y2 );
			ZetPar( d, "drop", uit.id );
			ZetPar( d, "kleur", inst.kleurDrop );
			ZetParReal( d, "hoogte", 0 );
			ZetParReal( d, "dropX", s.q[0] - x2 );
			ZetParReal( d, "dropY", s.q[1] - y2 );
			Afmaken( d, doelKlasse, Laag( inst.laagInfra ), undo );
		}
		if ( ! blokNrs.empty() )
			Meld( "Drop " + uit.id + " op " + s.t->naam + " (" + ( kant == "L" ? "links" : "rechts" ) + ") naar " + doelKlasse + ": " + blokNrs + "." );
		return true;
	}

	// --------------------------------------------------------------------------------------------------------
	// Wat er verder in de tekening staat (voor de 3D in de palette)
	std::string NaamVanSoort(MCObjectHandle h)
	{
		short t = gSDK->GetObjectTypeN( h );
		TXString naam;
		if ( t == kParametricNode )
		{
			MCObjectHandle fmt = VWParametricObj::GetRecordFormat( h );
			if ( fmt ) gSDK->GetObjectName( fmt, naam );
		}
		else if ( t == kSymbolNode )
		{
			MCObjectHandle def = gSDK->GetDefinition( h );
			if ( def ) gSDK->GetObjectName( def, naam );
		}
		return Std( naam );
	}

	bool Kubus(MCObjectHandle h, P3& mn, P3& mx)
	{
		WorldCube c;
		gSDK->GetObjectCube( h, c );
		if ( c.MaxX() < c.MinX() || c.MaxY() < c.MinY() || c.MaxZ() < c.MinZ() ) return false;
		mn = { c.MinX() / MM, c.MinY() / MM, c.MinZ() / MM };
		mx = { c.MaxX() / MM, c.MaxY() / MM, c.MaxZ() / MM };
		return true;
	}

	json Lagen()
	{
		json a = json::array();
		gSDK->ForEachLayerN( [&](MCObjectHandle h) {
			try
			{
				VWLayerObj l( h );
				if ( l.GetLayerType() == kLayerDesign ) a.push_back( Std( l.GetName() ) );
			}
			catch ( ... ) {}
		} );
		return a;
	}

	// ---------------- echte 3D-vorm (voor de trussen in de palette)
	// Vectorworks deelt het object op in driehoekjes (zoals bij de 3DS-export). Punten worden op hele millimeters
	// afgerond en dubbele punten samengevoegd, zodat het bestand klein blijft.
	const size_t MAX_DRIEHOEKEN_PER_OBJECT	= 150000;
	const size_t MAX_DRIEHOEKEN_PER_LAMP	= 12000;
	const size_t MAX_DRIEHOEKEN_TOTAAL		= 700000;

	struct Gaas
	{
		std::vector<long long>					v;		// x,y,z in mm
		std::vector<int>						f;		// 3 punten per driehoek
		std::unordered_map<std::string, int>	index;
		bool									vol = false;
		size_t									max = MAX_DRIEHOEKEN_PER_OBJECT;
	};

	int GaasPunt(Gaas& g, const WorldPt3& p)
	{
		long long x = std::llround( p.x ), y = std::llround( p.y ), z = std::llround( p.z );
		std::string k = std::to_string( x ) + "," + std::to_string( y ) + "," + std::to_string( z );
		auto it = g.index.find( k );
		if ( it != g.index.end() ) return it->second;
		int i = (int) ( g.v.size() / 3 );
		g.v.push_back( x ); g.v.push_back( y ); g.v.push_back( z );
		g.index[k] = i;
		return i;
	}

	void GaasDriehoek(ETessProcReason reden, STessTraingle t, CallBackPtr, void* env)
	{
		if ( reden != kTessProcAddTriangle || ! env ) return;
		Gaas& g = *static_cast<Gaas*>( env );
		if ( g.f.size() / 3 >= g.max ) { g.vol = true; return; }
		int a = GaasPunt( g, t.A.pt ), b = GaasPunt( g, t.B.pt ), c = GaasPunt( g, t.C.pt );
		if ( a == b || b == c || a == c ) return;
		g.f.push_back( a ); g.f.push_back( b ); g.f.push_back( c );
	}

	// Geeft {v:[...], f:[...]} in mm (wereldcoördinaten), of null als het niet lukt.
	json EchteVorm(MCObjectHandle h, size_t& totaal, size_t maxPerObject = MAX_DRIEHOEKEN_PER_OBJECT)
	{
		if ( totaal >= MAX_DRIEHOEKEN_TOTAAL ) return json();
		Gaas g;
		g.max = maxPerObject;
		try
		{
			TTesselator tess = gSDK->CreateTessellator( -1 );
			if ( ! tess ) return json();
			gSDK->TesselateObject( tess, h, GaasDriehoek, &g );
			gSDK->DeleteTessellator( tess );
		}
		catch ( ... ) { return json(); }
		if ( g.f.empty() ) return json();

		// Zijn de punten van het object zelf (niet van de tekening)? Dan alsnog naar de plek in de tekening zetten.
		WorldCube c;
		gSDK->GetObjectCube( h, c );
		auto Midden = [&](const std::vector<long long>& v, double m[3]) {
			double mn[3] = { 1e300, 1e300, 1e300 }, mx[3] = { -1e300, -1e300, -1e300 };
			for ( size_t i = 0; i + 2 < v.size(); i += 3 )
				for ( int k = 0; k < 3; k++ ) { mn[k] = std::min( mn[k], (double) v[i + k] ); mx[k] = std::max( mx[k], (double) v[i + k] ); }
			for ( int k = 0; k < 3; k++ ) m[k] = ( mn[k] + mx[k] ) / 2;
		};
		double cm[3] = { ( c.MinX() + c.MaxX() ) / 2, ( c.MinY() + c.MaxY() ) / 2, ( c.MinZ() + c.MaxZ() ) / 2 };
		double gm[3];
		Midden( g.v, gm );
		double afwijking = std::hypot( std::hypot( gm[0] - cm[0], gm[1] - cm[1] ), gm[2] - cm[2] );
		double maat = std::max( 1.0, std::hypot( std::hypot( c.MaxX() - c.MinX(), c.MaxY() - c.MinY() ), c.MaxZ() - c.MinZ() ) );
		if ( afwijking > maat * 0.25 )
		{
			TransformMatrix m;
			gSDK->GetEntityMatrix( h, m );
			VWTransformMatrix vm( m );
			std::vector<long long> w( g.v.size() );
			for ( size_t i = 0; i + 2 < g.v.size(); i += 3 )
			{
				VWPoint3D q = vm.PointTransform( VWPoint3D( (double) g.v[i], (double) g.v[i + 1], (double) g.v[i + 2] ) );
				w[i] = std::llround( q.x ); w[i + 1] = std::llround( q.y ); w[i + 2] = std::llround( q.z );
			}
			double wm[3];
			Midden( w, wm );
			if ( std::hypot( std::hypot( wm[0] - cm[0], wm[1] - cm[1] ), wm[2] - cm[2] ) < afwijking ) g.v.swap( w );
		}

		totaal += g.f.size() / 3;
		if ( g.vol ) Log( "Object heeft meer dan " + std::to_string( g.max ) + " driehoeken; rest overgeslagen." );
		return { { "v", g.v }, { "f", g.f } };
	}

	// Is dit een truss? Symboolnaam, map in het hulpbronnenbeheer, class of laag bevat een woord uit de lijst
	// (Instellingen > Trussen herkennen), of het object heeft een TrussRecord (Spotlight).
	bool IsTruss(MCObjectHandle h, const std::string& soort, const std::vector<std::string>& woorden, std::string* waarom = nullptr)
	{
		auto bevat = [&](const std::string& tekst, const char* wat) {
			std::string t = Klein( tekst );
			if ( t.empty() ) return false;
			for ( const std::string& w : woorden )
				if ( ! w.empty() && t.find( w ) != std::string::npos )
				{
					if ( waarom ) *waarom = std::string( wat ) + " bevat '" + w + "'";
					return true;
				}
			return false;
		};
		if ( bevat( soort, "naam" ) ) return true;
		if ( bevat( SymboolMap( h ), "map" ) ) return true;
		std::string k = Klein( KlasseVan( h ) ), l = Klein( LaagVan( h ) );
		if ( k.find( "truss" ) != std::string::npos ) { if ( waarom ) *waarom = "class bevat 'truss'"; return true; }
		if ( l.find( "truss" ) != std::string::npos ) { if ( waarom ) *waarom = "laag bevat 'truss'"; return true; }
		if ( VWRecordObj::GetRecordObject( h, "TrussRecord" ) != nullptr ) { if ( waarom ) *waarom = "TrussRecord"; return true; }
		return false;
	}

	// Bovenkant van de echte truss onder een punt (meters); false als er geen truss onder ligt
	struct Kader3D { P3 mn, mx; };

	std::vector<Kader3D> EchteTrussKaders(const Inst& inst)
	{
		std::vector<Kader3D> uit;
		std::vector<std::string> woorden = Woorden( inst.trussWoorden );
		for ( MCObjectHandle h : Objecten( "(ALL)" ) )
		{
			short t = gSDK->GetObjectTypeN( h );
			if ( t != kParametricNode && t != kSymbolNode ) continue;
			if ( IsKt( h ) || NaamVanSoort( h ) == LD ) continue;
			if ( ! IsTruss( h, NaamVanSoort( h ), woorden ) ) continue;
			Kader3D k;
			if ( Kubus( h, k.mn, k.mx ) ) uit.push_back( k );
		}
		return uit;
	}

	bool TrussBovenkant(const std::vector<Kader3D>& kaders, const Punten& pts, double& top)
	{
		bool gevonden = false;
		for ( size_t i = 0; i + 1 < pts.size(); i++ )
			for ( int s = 0; s <= 8; s++ )
			{
				double f = s / 8.0, x = pts[i][0] + ( pts[i + 1][0] - pts[i][0] ) * f, y = pts[i][1] + ( pts[i + 1][1] - pts[i][1] ) * f;
				for ( const Kader3D& k : kaders )
					if ( x >= k.mn[0] - 0.25 && x <= k.mx[0] + 0.25 && y >= k.mn[1] - 0.25 && y <= k.mx[1] + 0.25 && k.mx[2] > 0.3 )
					{
						top = gevonden ? std::max( top, k.mx[2] ) : k.mx[2];
						gevonden = true;
					}
			}
		return gevonden;
	}

	void TrussenEnLampen(json& data, const Inst& inst)
	{
		json trussen = json::array(), lampen = json::array();
		size_t driehoeken = 0;
		bool echt = inst.weergave3D != "basis";
		std::vector<std::string> woorden = Woorden( inst.trussWoorden );
		// opnieuw opdelen alleen als het object veranderd is (verplaatst, andere maat)
		static std::unordered_map<std::string, std::pair<std::string, json>> bewaard;
		auto Vorm = [&](MCObjectHandle h, const P3& mn, const P3& mx, size_t maxPer) -> json {
			char sleutel[160];
			std::snprintf( sleutel, sizeof(sleutel), "%.3f %.3f %.3f %.3f %.3f %.3f", mn[0], mn[1], mn[2], mx[0], mx[1], mx[2] );
			std::string id = Uuid( h );
			auto oud = bewaard.find( id );
			if ( oud != bewaard.end() && oud->second.first == sleutel )
			{
				const json& v = oud->second.second;
				if ( v.is_object() && v.contains( "f" ) ) driehoeken += v["f"].size() / 3;
				return v;
			}
			json vorm = EchteVorm( h, driehoeken, maxPer );
			if ( bewaard.size() > 3000 ) bewaard.clear();
			bewaard[id] = { sleutel, vorm };
			return vorm;
		};

		std::vector<MCObjectHandle> trussH, lampH;
		for ( MCObjectHandle h : Objecten( "(ALL)" ) )
		{
			short t = gSDK->GetObjectTypeN( h );
			if ( t != kParametricNode && t != kSymbolNode ) continue;
			if ( IsKt( h ) ) continue;
			std::string soort = NaamVanSoort( h );
			if ( soort == LD ) lampH.push_back( h );
			else if ( IsTruss( h, soort, woorden ) ) trussH.push_back( h );
		}
		// eerst de trussen (belangrijkst), dan de lampen
		for ( MCObjectHandle h : trussH )
		{
			P3 mn, mx;
			if ( ! Kubus( h, mn, mx ) ) continue;
			json tr = { { "naam", NaamVanSoort( h ) }, { "klasse", KlasseVan( h ) }, { "laag", LaagVan( h ) }, { "uuid", Uuid( h ) },
						{ "min", json::array( { mn[0], mn[1], mn[2] } ) }, { "max", json::array( { mx[0], mx[1], mx[2] } ) } };
			if ( echt )
			{
				json vorm = Vorm( h, mn, mx, MAX_DRIEHOEKEN_PER_OBJECT );
				if ( vorm.is_object() ) tr["vorm"] = vorm;
			}
			trussen.push_back( tr );
		}
		for ( MCObjectHandle h : lampH )
		{
			P3 mn, mx;
			if ( ! Kubus( h, mn, mx ) ) continue;
			std::string naam = Veld( h, LD, "Inst Type" ) + " " + Veld( h, LD, "Unit Number" );
			while ( ! naam.empty() && naam.back() == ' ' ) naam.pop_back();
			while ( ! naam.empty() && naam.front() == ' ' ) naam.erase( 0, 1 );
			json l = { { "uuid", Uuid( h ) }, { "naam", naam }, { "type", Veld( h, LD, "Inst Type" ) }, { "laag", LaagVan( h ) },
					   { "klasse", KlasseVan( h ) }, { "drop", Veld( h, LINK, "drop" ) },
					   { "x", ( mn[0] + mx[0] ) / 2 }, { "y", ( mn[1] + mx[1] ) / 2 }, { "z", ( mn[2] + mx[2] ) / 2 },
					   { "maat", json::array( { mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2] } ) } };
			if ( echt )
			{
				json vorm = Vorm( h, mn, mx, MAX_DRIEHOEKEN_PER_LAMP );
				if ( vorm.is_object() ) l["vorm"] = vorm;
			}
			lampen.push_back( l );
		}
		if ( driehoeken >= MAX_DRIEHOEKEN_TOTAAL )
			Meld( "3D: de tekening is zwaar; niet alle objecten hebben hun echte vorm. Zet zo nodig Instellingen > 3D > Basisweergave aan." );
		data["trussen"] = trussen;
		data["alleLampen"] = lampen;
		data["lagen"] = Lagen();
	}

	// Truss-diagnose: wat is het geselecteerde object en waarom wordt het wel/niet als truss herkend
	json Diagnose(const Inst& inst)
	{
		json a = json::array();
		std::vector<std::string> woorden = Woorden( inst.trussWoorden );
		static const std::map<short, const char*> TYPES = {
			{ kSymbolNode, "symbool" }, { kParametricNode, "plug-in object" }, { kGroupNode, "groep" }, { kTextNode, "tekst" },
			{ kLineNode, "lijn" }, { kPolygonNode, "polygoon" }, { kPolylineNode, "polylijn" }, { qPolyNode, "3D-polygoon" } };
		int n = 0;
		for ( MCObjectHandle h : Objecten( "(SEL=TRUE)" ) )
		{
			if ( n++ >= 50 ) break;
			short t = gSDK->GetObjectTypeN( h );
			auto ty = TYPES.find( t );
			std::string soort = NaamVanSoort( h ), waarom;
			bool truss = ( t == kSymbolNode || t == kParametricNode ) && ! IsKt( h ) && soort != LD && IsTruss( h, soort, woorden, &waarom );
			P3 mn = { 0, 0, 0 }, mx = { 0, 0, 0 };
			Kubus( h, mn, mx );
			Nummer nr;
			std::vector<std::string> recs, teksten;
			RecordWaarden( h, recs );
			if ( t == kSymbolNode ) TekstenIn( gSDK->GetDefinition( h ), teksten );
			else if ( t == kGroupNode ) TekstenIn( h, teksten );
			else if ( t == kTextNode ) teksten.push_back( Std( gSDK->GetTextChars( h ) ) );
			std::string blok;
			for ( const std::string& w : recs ) if ( LeesNummer( w, nr ) ) { blok = nr.tekst + " (record)"; break; }
			if ( blok.empty() && LeesNummer( ObjectNaam( h ), nr ) ) blok = nr.tekst + " (naam)";
			if ( blok.empty() ) for ( const std::string& w : teksten ) if ( LeesNummer( w, nr ) ) { blok = nr.tekst + " (tekst)"; break; }
			json d = { { "type", ty != TYPES.end() ? ty->second : std::to_string( t ) }, { "soort", soort }, { "map", SymboolMap( h ) },
					   { "naam", ObjectNaam( h ) }, { "klasse", KlasseVan( h ) }, { "laag", LaagVan( h ) }, { "records", RecordNamen( h ) },
					   { "truss", truss }, { "waarom", truss ? waarom : std::string( "geen herkenningswoord in naam, map, class of laag" ) },
					   { "lamp", soort == LD }, { "blok", blok },
					   { "maat", json::array( { mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2] } ) }, { "bovenkant", mx[2] } };
			Log( "Diagnose: " + d.dump() );
			a.push_back( d );
		}
		if ( a.empty() ) Meld( "Selecteer eerst een of meer objecten (bijvoorbeeld een truss) in de tekening." );
		return a;
	}

	// --------------------------------------------------------------------------------------------------------
	// Uitwisselen met de palette
	json Exporteer()
	{
		std::string b = BasisVerplicht();
		Inst inst = LeesInst();
		ZorgRecords();
		json data = {
			{ "versie", 3 }, { "dimcities", json::array() }, { "vloerroutes", json::array() }, { "trusslijnen", json::array() },
			{ "drops", json::array() }, { "lampen", json::array() }, { "selectie", json::array() }, { "blokken", json::array() } };

		for ( MCObjectHandle h : Objecten( Pon( KT_DIMCITY ) ) )
		{
			std::string id = Par( h, "ktId" );
			P3 p = Positie( h );
			int nr = 1;
			try { nr = std::stoi( id.substr( 2 ) ); } catch ( ... ) {}
			data["dimcities"].push_back( { { "id", id }, { "nr", nr }, { "uuid", Uuid( h ) }, { "naam", Par( h, "naam" ) },
										   { "x", p[0] }, { "y", p[1] }, { "z", 0 }, { "laag", LaagVan( h ) },
										   { "maat", ParReal( h, "maat", 1 ) }, { "kast", ParReal( h, "kastHoogte", 2 ) } } );
		}
		std::vector<Kader3D> kaders;
		bool kadersGelezen = false;
		for ( MCObjectHandle h : Objecten( Pon( KT_ROUTE ) ) )
		{
			std::string id = Par( h, "ktId" );
			Punten pts = RoutePunten( h );
			json r = { { "id", id }, { "uuid", Uuid( h ) }, { "punten", NaarJson( pts ) }, { "laag", LaagVan( h ) },
					   { "locatie", Par( h, "locatie" ) }, { "klasse", KlasseVan( h ) } };
			if ( Par( h, "soort" ) == "Truss" )
			{
				std::string naam = Par( h, "naam" );
				r["naam"] = naam;
				r["klasse"] = ZonderPrefix( KlasseVan( h ), inst.prefix );
				if ( r["klasse"].get<std::string>().empty() || r["klasse"] == "None" ) r["klasse"] = naam;
				// bovenkant van de echte truss eronder (kabels liggen óp de truss)
				if ( ! kadersGelezen ) { kaders = EchteTrussKaders( inst ); kadersGelezen = true; }
				double top = 0;
				if ( TrussBovenkant( kaders, pts, top ) ) r["bovenkant"] = top;
				data["trusslijnen"].push_back( r );
			}
			else
				data["vloerroutes"].push_back( r );
		}
		// eindpunten van de drops (KT_Dropdoel), per drop
		std::map<std::string, json> doelen;
		for ( MCObjectHandle h : Objecten( Pon( KT_DOEL ) ) )
		{
			P3 p = Positie( h );
			doelen[ Par( h, "drop" ) ] = { { "x", p[0] }, { "y", p[1] }, { "klasse", KlasseVan( h ) }, { "uuid", Uuid( h ) },
										   { "hoogte", ParReal( h, "hoogte", 0 ) } };
		}
		for ( MCObjectHandle h : Objecten( Pon( KT_DROP ) ) )
		{
			P3 p = Positie( h );
			std::string id = Par( h, "ktId" );
			double val = ParReal( h, "valhoogte", 0 );
			json d = { { "id", id }, { "uuid", Uuid( h ) }, { "truss", Par( h, "truss" ) },
					   { "x", p[0] }, { "y", p[1] }, { "z", ParReal( h, "z", 0 ) }, { "laag", LaagVan( h ) }, { "klasse", KlasseVan( h ) },
					   { "objectnaam", Par( h, "objectnaam" ) }, { "valhoogte", val > 0 ? json( val ) : json( "" ) },
					   { "slingers", ParReal( h, "slingers", 1 ) }, { "kant", Par( h, "kant" ) }, { "richting", ParReal( h, "richting", 0 ) },
					   { "vorm", Par( h, "vorm" ) }, { "droplengte", ParReal( h, "droplengte", 0 ) }, { "doelKlasse", Par( h, "doelKlasse" ) } };
			auto doel = doelen.find( id );
			if ( doel != doelen.end() ) d["doel"] = doel->second;
			data["drops"].push_back( d );
		}
		for ( MCObjectHandle h : Objecten( MetRecord( LINK ) ) )
		{
			std::string naam = Veld( h, LD, "Inst Type" ) + " " + Veld( h, LD, "Unit Number" );
			while ( ! naam.empty() && naam.back() == ' ' ) naam.pop_back();
			while ( ! naam.empty() && naam.front() == ' ' ) naam.erase( 0, 1 );
			data["lampen"].push_back( { { "uuid", Uuid( h ) }, { "naam", naam }, { "drop", Veld( h, LINK, "drop" ) }, { "klasse", KlasseVan( h ) } } );
		}
		data["blokken"] = BlokkenJson( Blokken( inst ) );
		for ( const char* pon : { KT_DIMCITY, KT_DROP, KT_ROUTE } )
			for ( MCObjectHandle h : Objecten( "(SEL=TRUE) & " + Pon( pon ) ) )
				data["selectie"].push_back( Par( h, "ktId" ) );
		for ( MCObjectHandle h : Objecten( "(SEL=TRUE) & " + Pon( KT_DOEL ) ) )
			data["selectie"].push_back( Par( h, "drop" ) );

		for ( const char* lijst : { "dimcities", "vloerroutes", "trusslijnen", "drops" } )
		{
			json& a = data[lijst];
			std::sort( a.begin(), a.end(), [](const json& p, const json& q) {
				std::string i = p.value( "id", "" ), j = q.value( "id", "" );
				return i.size() != j.size() ? i.size() < j.size() : i < j;
			} );
		}

		TrussenEnLampen( data, inst );
		SchrijfJson( b + ".kt-tekening.json", data, -1 );		// compact: de 3D-vormen zijn groot
		return data;
	}

	void SelecteerId(const std::string& doel)
	{
		if ( doel.empty() ) return;
		gSDK->DeselectAll();
		for ( const char* pon : { KT_DIMCITY, KT_DROP, KT_ROUTE } )
			for ( MCObjectHandle h : Objecten( Pon( pon ) ) )
				if ( Par( h, "ktId" ) == doel ) gSDK->SelectObject( h, true );
		for ( MCObjectHandle h : Objecten( Pon( KT_DOEL ) ) )
			if ( Par( h, "drop" ) == doel ) gSDK->SelectObject( h, true );
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

	// Bewaren + drop-instellingen uit de palette naar de Object Info van de drops
	json Bewaar(const json& args)
	{
		std::string b = BasisVerplicht();
		SchrijfJson( b + ".kt-project.json", args );

		if ( ! args.is_object() || ! args.contains( "dropinst" ) || ! args["dropinst"].is_object() ) return true;
		const json& di = args["dropinst"];
		std::unique_ptr<Undo> undo;
		for ( MCObjectHandle h : Objecten( Pon( KT_DROP ) ) )
		{
			std::string id = Par( h, "ktId" );
			if ( ! di.contains( id ) || ! di[id].is_object() ) continue;
			const json& d = di[id];
			std::string naam = Tekst( d, "naam" );
			double val = Num( d, "valhoogte", 0 ), sl = Num( d, "slinger", 1 ), dl = Num( d, "droplengte", ParReal( h, "droplengte", 0 ) );
			std::string vorm = Tekst( d, "vorm", Par( h, "vorm" ) ), kant = Tekst( d, "kant", Par( h, "kant" ) );
			if ( vorm != "Recht" && vorm != "Realistisch" ) vorm = "Boog";
			if ( kant != "R" ) kant = "L";
			bool anders = naam != Par( h, "objectnaam" ) || std::abs( val - ParReal( h, "valhoogte", 0 ) ) > 1e-6
						|| std::abs( sl - ParReal( h, "slingers", 1 ) ) > 1e-6 || std::abs( dl - ParReal( h, "droplengte", 0 ) ) > 1e-6
						|| vorm != Par( h, "vorm" ) || kant != Par( h, "kant" );
			if ( ! anders ) continue;
			if ( ! undo ) undo.reset( new Undo( "Kabeltool: drop-instellingen" ) );
			undo->VoorWijziging( h );
			ZetPar( h, "objectnaam", naam );
			ZetParReal( h, "valhoogte", val );
			ZetParReal( h, "slingers", sl );
			ZetParReal( h, "droplengte", dl );
			ZetPar( h, "vorm", vorm );
			ZetPar( h, "kant", kant );
			gSDK->ResetObject( h );
			undo->NaWijziging( h );
		}
		return true;
	}

	json Selectie()
	{
		json a = json::array();
		for ( const char* pon : { KT_DIMCITY, KT_DROP, KT_ROUTE } )
			for ( MCObjectHandle h : Objecten( "(SEL=TRUE) & " + Pon( pon ) ) )
				a.push_back( Par( h, "ktId" ) );
		return a;
	}

	// Geselecteerde lijnen/polylijnen worden een Kabelroute (het origineel verdwijnt)
	void RouteVanSelectie(bool truss, const json& args)
	{
		Inst inst = LeesInst();
		Undo undo( truss ? "Kabeltool: truss-lijn" : "Kabeltool: vloerroute" );
		double hoogte = Num( args, "hoogte", 8 );
		int n = 0;
		for ( MCObjectHandle h : Objecten( "(SEL=TRUE)" ) )
		{
			short t = gSDK->GetObjectTypeN( h );
			if ( ! IsLijnSoort( t ) || IsKt( h ) ) continue;
			Punten pts = PuntenVan( h );
			if ( pts.size() < 2 ) continue;
			std::string klasse = KlasseVan( h );
			if ( truss )
			{
				std::string naam = ZonderPrefix( klasse, inst.prefix );
				if ( naam == "None" ) naam.clear();
				naam = TrussNaam( naam );
				double z = t == qPolyNode ? pts[0][2] : hoogte;
				MaakRoute( pts, true, naam, z, inst.prefix + naam, inst.laagInfra, undo );
			}
			else
				MaakRoute( pts, false, "", 0, klasse, inst.laagCabling, undo );
			undo.Weg( h );
			n++;
		}
		if ( ! n ) Meld( truss ? "Selecteer eerst een lijn, polylijn of 3D-polygoon." : "Selecteer eerst een lijn of polylijn." );
	}

	void LampenKoppelen()
	{
		ZorgRecords();
		std::string drop;
		for ( MCObjectHandle h : Objecten( "(SEL=TRUE) & " + Pon( KT_DROP ) ) )
			drop = Par( h, "ktId" );
		if ( drop.empty() )
		{
			Meld( "Selecteer ook de drop." );
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

	// ---------------- Tekening bijwerken: labels en 3D-kabels opnieuw maken
	std::string RijenTekst(const json& rijen)
	{
		std::string s;
		if ( ! rijen.is_array() ) return s;
		for ( const json& r : rijen )
		{
			auto zonderHekje = [](std::string k) { if ( ! k.empty() && k[0] == '#' ) k.erase( 0, 1 ); return k; };
			bool vet = r.is_object() && r.contains( "vet" ) && r["vet"].is_boolean() && r["vet"].get<bool>();
			std::string rij = Tekst( r, "kort" ) + "|" + Tekst( r, "lengte" ) + "|" + zonderHekje( Tekst( r, "kleur" ) ) + "|" + Tekst( r, "nummer" )
							+ "|" + zonderHekje( Tekst( r, "rand" ) ) + "|" + ( vet ? "1" : "0" );
			s += ( s.empty() ? "" : ";" ) + rij;
		}
		return s;
	}

	// Verdeelt de rijen over 4 velden van hooguit 250 tekens (grens van een tekstveld)
	std::vector<std::string> InVakken(const std::string& tekst)
	{
		std::vector<std::string> vakken( 4 );
		size_t v = 0, begin = 0;
		while ( begin < tekst.size() && v < 4 )
		{
			size_t eind = tekst.find( ';', begin );
			if ( eind == std::string::npos ) eind = tekst.size();
			std::string rij = tekst.substr( begin, eind - begin );
			if ( ! vakken[v].empty() && vakken[v].size() + 1 + rij.size() > 250 ) v++;
			if ( v >= 4 ) break;
			vakken[v] += ( vakken[v].empty() ? "" : ";" ) + rij;
			begin = eind + 1;
		}
		if ( begin < tekst.size() ) Meld( "Een label heeft te veel kabels; niet alle rijen passen." );
		return vakken;
	}

	void TekeningBijwerken()
	{
		json p = LeesProject();
		Inst inst = LeesInst();
		if ( ! p.is_object() || p.empty() )
		{
			Meld( "Geen projectbestand gevonden. Open de tekening eerst in de palette." );
			return;
		}
		Undo undo( "Kabeltool: tekening bijwerken" );

		// kaders die met de hand verschoven zijn, onthouden: het nieuwe label krijgt dezelfde plek
		auto Sleutel = [](const std::string& soort, const std::string& titel, double x, double y, double rij, const std::string& blok) {
			char buf[64];
			std::snprintf( buf, sizeof(buf), "|%.0f|%.0f|%.0f|", x * 100.0, y * 100.0, rij );
			return soort + "|" + titel + buf + blok;
		};
		std::map<std::string, std::pair<double, double>> verschoven;
		for ( MCObjectHandle h : Objecten( Pon( KT_LABEL ) ) )
		{
			if ( Par( h, "verschoven" ) != "1" ) continue;
			P3 p = Positie( h );
			verschoven[ Sleutel( Par( h, "soort" ), Par( h, "titel" ), p[0], p[1], ParReal( h, "rijNr", 0 ), Par( h, "blokSoort" ) ) ] =
				{ ParReal( h, "kaderX", 0 ), ParReal( h, "kaderY", 0 ) };
		}

		for ( const char* pon : { KT_LABEL, KT_KABEL } )
			for ( MCObjectHandle h : Objecten( Pon( pon ) ) )
				undo.Weg( h );

		// labels
		int nl = 0;
		const json lijst = p.contains( "tekenlijst" ) && p["tekenlijst"].is_array() ? p["tekenlijst"] : json::array();
		for ( const json& lb : lijst )
		{
			MCObjectHandle laag = Laag( Tekst( lb, "laag", "cabling" ) == "infra" ? inst.laagInfra : inst.laagCabling );
			double schaal = 1.0;
			gSDK->GetLayerScaleN( laag, schaal );
			if ( schaal <= 0 ) schaal = 1.0;

			MCObjectHandle h = MaakPunt( KT_LABEL, Num( lb, "x", 0 ), Num( lb, "y", 0 ) );
			ZetPar( h, "soort", Tekst( lb, "soort" ) );
			ZetPar( h, "titel", Tekst( lb, "titel" ) );
			ZetParReal( h, "breedte", inst.symboolBreedte );
			ZetParReal( h, "hoogte", inst.symboolHoogte );
			ZetParReal( h, "schaal", schaal );
			ZetParReal( h, "nx", Num( lb, "nx", 0 ) );
			ZetParReal( h, "ny", Num( lb, "ny", 1 ) );
			ZetParReal( h, "rijNr", Num( lb, "rijNr", 0 ) );
			ZetParReal( h, "dcMaat", inst.dimcityMaat );
			ZetPar( h, "kader", Tekst( lb, "kader", "#000000" ) );
			ZetPar( h, "blokSoort", Tekst( lb, "blokSoort" ) );
			ZetParReal( h, "poorten", Num( lb, "poorten", 6 ) );
			ZetPar( h, "letter", Tekst( lb, "letter" ) );
			std::vector<std::string> vakken = InVakken( RijenTekst( lb.contains( "rijen" ) ? lb["rijen"] : json::array() ) );
			ZetPar( h, "rijen1", vakken[0] );
			ZetPar( h, "rijen2", vakken[1] );
			ZetPar( h, "rijen3", vakken[2] );
			ZetPar( h, "rijen4", vakken[3] );
			auto oud = verschoven.find( Sleutel( Tekst( lb, "soort" ), Tekst( lb, "titel" ), Num( lb, "x", 0 ), Num( lb, "y", 0 ),
												 Num( lb, "rijNr", 0 ), Tekst( lb, "blokSoort" ) ) );
			if ( oud != verschoven.end() )
			{
				ZetParReal( h, "kaderX", oud->second.first );
				ZetParReal( h, "kaderY", oud->second.second );
				ZetPar( h, "verschoven", "1" );
			}
			// alleen in bovenaanzicht (schermvlak), niet plat op de vloer in 3D
			gSDK->SetPlanarRefID( h, kPlanarRefID_ScreenPlane );
			std::string k = Tekst( lb, "klasse" );
			Afmaken( h, inst.prefix + ( k.empty() ? "Kabels" : k ), laag, undo );
			nl++;
		}

		// kabels als 3D-buizen, elk stuk apart
		int nk = 0;
		if ( inst.kabels3D && p.contains( "kabelpaden" ) && p["kabelpaden"].is_array() )
		{
			MCObjectHandle laag = Laag( inst.laagKabels );
			for ( const json& k : p["kabelpaden"] )
			{
				Punten pts;
				if ( k.contains( "punten" ) && k["punten"].is_array() )
					for ( const json& q : k["punten"] )
						if ( q.is_array() && q.size() >= 3 )
							pts.push_back( { NaarGetal( q[0], 0 ), NaarGetal( q[1], 0 ), NaarGetal( q[2], 0 ) } );
				if ( pts.size() < 2 ) continue;
				MCObjectHandle h = MaakPad3D( KT_KABEL, pts );
				ZetPar( h, "nummer", Tekst( k, "nummer" ) );
				ZetPar( h, "type", Tekst( k, "type" ) );
				ZetPar( h, "kort", Tekst( k, "kort" ) );
				ZetPar( h, "lengte", Tekst( k, "lengte" ) );
				ZetParReal( h, "totaal", Num( k, "totaal", 0 ) );
				ZetParReal( h, "diameter", Num( k, "diameter", 20 ) );
				ZetPar( h, "kleur", Tekst( k, "kleur", "#9e9e9e" ) );
				ZetParBool( h, "toon2D", inst.kabels2D );
				std::string kl = Tekst( k, "klasse" );
				Afmaken( h, inst.prefix + ( kl.empty() ? "Kabels" : kl ), laag, undo );
				nk++;
			}
		}
		// waarschuwingen als markering in de tekening (Instellingen > Waarschuwingen ook in de tekening)
		int nw = 0;
		if ( inst.markeringen && p.contains( "waarschuwingen" ) && p["waarschuwingen"].is_array() )
		{
			MCObjectHandle laag = Laag( inst.laagInfra );
			double schaal = 1.0;
			gSDK->GetLayerScaleN( laag, schaal );
			if ( schaal <= 0 ) schaal = 1.0;
			for ( const json& w : p["waarschuwingen"] )
			{
				if ( ! w.is_object() || ! w.contains( "x" ) || ! w.contains( "y" ) ) continue;
				MCObjectHandle h = MaakPunt( KT_LABEL, Num( w, "x", 0 ), Num( w, "y", 0 ) );
				ZetPar( h, "soort", "waarschuwing" );
				ZetPar( h, "titel", Tekst( w, "kort", Tekst( w, "tekst" ) ) );
				ZetPar( h, "kader", Tekst( w, "niveau" ) == "fout" ? "#e53935" : "#f59e0b" );
				ZetParReal( h, "breedte", inst.symboolBreedte );
				ZetParReal( h, "hoogte", inst.symboolHoogte );
				ZetParReal( h, "schaal", schaal );
				gSDK->SetPlanarRefID( h, kPlanarRefID_ScreenPlane );
				Afmaken( h, "KT Waarschuwingen", laag, undo );
				nw++;
			}
		}

		// eindpunten: het lijntje naar de drop volgt een verplaatste drop
		std::map<std::string, P3> dropPlek;
		for ( MCObjectHandle h : Objecten( Pon( KT_DROP ) ) ) dropPlek[ Par( h, "ktId" ) ] = Positie( h );
		for ( MCObjectHandle h : Objecten( Pon( KT_DOEL ) ) )
		{
			auto d = dropPlek.find( Par( h, "drop" ) );
			if ( d == dropPlek.end() ) continue;
			P3 q = Positie( h );
			double dx = d->second[0] - q[0], dy = d->second[1] - q[1];
			if ( std::abs( dx - ParReal( h, "dropX", 0 ) ) < 1e-3 && std::abs( dy - ParReal( h, "dropY", 0 ) ) < 1e-3 ) continue;
			undo.VoorWijziging( h );
			ZetParReal( h, "dropX", dx );
			ZetParReal( h, "dropY", dy );
			gSDK->ResetObject( h );
			undo.NaWijziging( h );
		}

		Meld( std::to_string( nl ) + " labels en " + std::to_string( nk ) + " kabelstukken getekend"
			  + ( nw ? ", " + std::to_string( nw ) + " waarschuwingen gemarkeerd." : "." ) );
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
			MCObjectHandle h = gSDK->GetObjectByUuid( Tx( Tekst( s, "uuid" ) ) );
			if ( ! h || ! VWRecordObj::GetRecordObject( h, LD ) )
			{
				mis++;
				continue;
			}
			undo.VoorWijziging( h );
			ZetVeld( h, LD, "Circuit Name", Tekst( s, "circuitName" ) );
			ZetVeld( h, LD, "Circuit Number", Tekst( s, "circuitNumber" ) );
			ZetVeld( h, LD, "User Field 2", Tekst( s, "uf2" ) );
			ZetVeld( h, LD, "User Field 3", Tekst( s, "uf3" ) );
			gSDK->ResetObject( h );
			undo.NaWijziging( h );
			n++;
		}
		Meld( std::to_string( n ) + " lampen gestempeld" + ( mis ? ", " + std::to_string( mis ) + " niet gevonden." : "." ) );
	}

	// ---------------- demo-show
	int DemoLampen(const Drop& d, int aantal, double hoogte, const Inst& inst, Undo& undo)
	{
		MCObjectHandle laag = Laag( inst.laagLampen );
		int gelukt = 0;
		for ( int i = 0; i < aantal; i++ )
		{
			double lx = ( d.doelX + ( i - ( aantal - 1 ) / 2.0 ) ) * MM, ly = d.doelY * MM;
			MCObjectHandle h = nullptr;
			try { h = gSDK->CreateCustomObject( Tx( LD ), WorldPt( lx, ly ), 0.0, true ); }
			catch ( ... ) { h = nullptr; }
			if ( ! h || ! VWRecordObj::GetRecordObject( h, LD ) )
			{
				if ( h ) gSDK->DeleteObject( h, false );
				continue;
			}
			ZetKlasse( h, d.doelKlasse );
			NaarLaag( h, laag );
			ZetVeld( h, LD, "Inst Type", "Demo spot" );
			ZetVeld( h, LD, "Unit Number", d.doelKlasse + "-" + std::to_string( i + 1 ) );
			ZetVeld( h, LD, "Z", Getal( hoogte * MM ) );
			gSDK->ResetObject( h );
			undo.Nieuw( h );
			gelukt++;
		}
		return gelukt;
	}

	// Blok voor de demo: een losse tekst met het nummer (zoals een blok met nummer) op de infra-laag
	void DemoBlok(const std::string& nummer, const std::string& klasse, double x, double y, const Inst& inst, Undo& undo)
	{
		VWTextBlockObj t( Tx( nummer ), VWPoint2D( x * MM, y * MM ) );
		t.SetTextSizeByPoint( 10 );
		MCObjectHandle h = t.GetThisObject();
		if ( ! h ) return;
		ZetKlasse( h, klasse );
		NaarLaag( h, Laag( inst.laagInfra ) );
		undo.Nieuw( h );
	}

	void DemoShow()
	{
		Inst inst = LeesInst();
		ZorgRecords();
		for ( const char* pon : { KT_DIMCITY, KT_DROP, KT_ROUTE } )
			if ( ! Objecten( Pon( pon ) ).empty() )
			{
				Meld( "Deze tekening heeft al Kabeltool-objecten. Maak de demo-show in een nieuwe, lege tekening." );
				return;
			}
		Undo undo( "Kabeltool: demo-show" );

		MaakDimcity( 0, 0, inst, undo );
		MaakDimcity( 20, 0, inst, undo );

		// kabeltrussen CB01 en CB02 op 8 m (eerste punt = begin van de kabeltruss)
		MaakRoute( { { 4, 10, 0 }, { 16, 10, 0 } }, true, "CB01", 8, inst.prefix + "CB01", inst.laagInfra, undo );
		MaakRoute( { { 16, 16, 0 }, { 4, 16, 0 } }, true, "CB02", 8, inst.prefix + "CB02", inst.laagInfra, undo );

		// vloerroutes van de dim city naar de voet van de grote drop
		MaakRoute( { { 0, 0, 0 }, { 0, 10, 0 }, { 4, 10, 0 } }, false, "", 0, "DB1", inst.laagCabling, undo );
		MaakRoute( { { 20, 0, 0 }, { 20, 16, 0 }, { 16, 16, 0 } }, false, "", 0, "DB2", inst.laagCabling, undo );

		// blokken met nummer: het nummer bepaalt de dim city en de kabels
		struct Doel { const char* klasse; double x, y; std::vector<const char*> nrs; double dropX, dropY; };
		std::vector<Doel> doelen = {
			{ "LX1", 7, 7, { "M101", "LK101" }, 7, 9.8 },
			{ "LX2", 13, 7, { "M102", "V101" }, 13, 9.8 },
			{ "LX3", 10, 19, { "M201", "LK201" }, 10, 16.2 },
		};
		for ( const Doel& d : doelen )
			for ( size_t i = 0; i < d.nrs.size(); i++ )
				DemoBlok( d.nrs[i], d.klasse, d.x + 1.2, d.y - 0.6 * i, inst, undo );

		std::vector<Drop> drops;
		for ( const Doel& d : doelen )
		{
			Drop dr;
			if ( MaakDrop( d.dropX, d.dropY, d.x, d.y, true, d.klasse, inst.dropVorm, inst, undo, dr ) ) drops.push_back( dr );
		}
		// eindpunten op 6 m (de lampen hangen daar)
		for ( MCObjectHandle h : Objecten( Pon( KT_DOEL ) ) ) { ZetParReal( h, "hoogte", 6 ); gSDK->ResetObject( h ); }

		int lampen = 0;
		for ( const Drop& d : drops )
			lampen += DemoLampen( d, 4, 6, inst, undo );

		gMeldingen.clear();
		if ( lampen )
			Meld( "Demo-show getekend: 2 dim cities, kabeltrussen CB01 en CB02, 2 vloerroutes, " + std::to_string( drops.size() ) + " drops met blokken, " + std::to_string( lampen ) + " lampen." );
		else
			Meld( "Demo-show getekend: 2 dim cities, kabeltrussen CB01 en CB02, 2 vloerroutes, " + std::to_string( drops.size() ) +
				  " drops met blokken. Lampen konden niet gemaakt worden (Spotlight)." );
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
			MaakDimcity( Num( a, "x", 0 ), Num( a, "y", 0 ), inst, undo );
		}
		else if ( functie == "drop" )
		{
			// klik 1 = droppunt (snapt op de truss-lijn, de muis bepaalt de kant), klik 2 = eindpunt bij het object
			std::string klasse = Tekst( a, "klasse" );
			bool metDoel = a.is_object() && a.contains( "x2" ) && ! klasse.empty();
			if ( a.is_object() && a.contains( "x2" ) && klasse.empty() )
				Meld( "Kies in de modusbalk bij Object de class van het object (bijv. LX1). De drop is zonder eindpunt geplaatst." );
			Undo undo( "Kabeltool: drop" );
			Drop d;
			MaakDrop( Num( a, "x", 0 ), Num( a, "y", 0 ), Num( a, "x2", 0 ), Num( a, "y2", 0 ), metDoel, klasse,
					  Tekst( a, "vorm", inst.dropVorm ), inst, undo, d, Tekst( a, "kant" ) );
		}
		else if ( functie == "vloer" )
		{
			Punten pts = PuntenUit( a );
			if ( pts.size() < 2 ) { Meld( "Klik minstens twee punten voor een vloerroute." ); return; }
			Undo undo( "Kabeltool: vloerroute" );
			MaakRoute( pts, false, "", 0, ActieveKlasse(), inst.laagCabling, undo );
		}
		else if ( functie == "truss" )
		{
			Punten pts = PuntenUit( a );
			if ( pts.size() < 2 ) { Meld( "Klik minstens twee punten voor een truss-lijn (eerste punt = begin van de kabeltruss)." ); return; }
			std::string naam = Tekst( a, "naam" );
			while ( ! naam.empty() && naam.back() == ' ' ) naam.pop_back();
			naam = TrussNaam( naam );
			// hoogte "auto" (of leeg): de bovenkant van de echte truss onder de lijn
			std::string ht = Klein( Tekst( a, "hoogte" ) );
			double hoogte = NaarGetal( json( ht ), -1 );
			if ( hoogte < 0 )
			{
				double top = 0;
				if ( TrussBovenkant( EchteTrussKaders( inst ), pts, top ) ) hoogte = top;
				else
				{
					hoogte = 8;
					Meld( "Geen truss onder de lijn gevonden; hoogte 8 m gebruikt. Pas hem aan in de Object Info, of controleer met Truss-diagnose of je truss herkend wordt." );
				}
			}
			Undo undo( "Kabeltool: truss-lijn" );
			MaakRoute( pts, true, naam, hoogte, inst.prefix + naam, inst.laagInfra, undo );
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
		else if ( functie == "selecteer" )	SelecteerId( Tekst( args, "id" ) );
		else if ( functie == "vloer" )		RouteVanSelectie( false, args );
		else if ( functie == "truss" )		RouteVanSelectie( true, args );
		else if ( functie == "lampen" )		LampenKoppelen();
		else if ( functie == "bijwerken" )	TekeningBijwerken();
		else if ( functie == "stempelen" )	Stempelen();
		else if ( functie == "demo" )		DemoShow();
		else if ( functie == "diagnose" )	data = Diagnose( LeesInst() );
		else if ( functie == "opruimen" )
		{
			Inst inst = LeesInst();
			LagenOpruimen( { inst.laagCabling, inst.laagInfra, inst.laagKabels, inst.laagLampen, "Cabling", "Infraplot", "Lightplot" } );
		}
		else throw Stop{ "Onbekende functie: " + functie };

		// na een actie die de tekening verandert: geometriebestand bijwerken
		if ( functie != "laad" && functie != "bewaar" && functie != "selectie" && functie != "selecteer" && functie != "diagnose" )
			Exporteer();

		antwoord = { { "ok", true }, { "data", data } };
	}
	catch ( const Stop& s )				{ antwoord = { { "ok", false }, { "fout", s.tekst } }; }
	catch ( const std::exception& e )	{ antwoord = { { "ok", false }, { "fout", std::string( "Interne fout: " ) + e.what() } }; }
	catch ( ... )						{ antwoord = { { "ok", false }, { "fout", "Onbekende interne fout." } }; }
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
	catch ( const Stop& s )				{ fout = s.tekst; }
	catch ( const std::exception& e )	{ fout = std::string( "Interne fout: " ) + e.what(); }
	catch ( ... )						{ fout = "Onbekende interne fout."; }

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

// ------------------------------------------------------------------------------------------------------------
// Voor de drop-tool
namespace
{
	std::vector<Truss> gToolTrussen;
}

void Kabeltool::ToolVoorbereiden()
{
	try { gToolTrussen = Trussen(); }
	catch ( ... ) { gToolTrussen.clear(); }
}

Kabeltool::TrussSnap Kabeltool::SnapOpTruss(double x, double y)
{
	TrussSnap u;
	try
	{
		Snap s = SnapOp( gToolTrussen, x, y );
		if ( ! s.t ) return u;
		u.ok = true;
		u.naam = s.t->naam;
		u.x = s.q[0]; u.y = s.q[1]; u.z = s.q[2];
		u.rx = s.rx; u.ry = s.ry;
		u.afstand = s.d;
		u.langs = s.langs;
		u.kant = KantVan( s, x, y );
	}
	catch ( ... ) { u.ok = false; }
	return u;
}

std::vector<std::pair<std::string, std::string>> Kabeltool::DoelKlassen()
{
	std::vector<std::pair<std::string, std::string>> uit;
	try
	{
		Inst inst;
		try { inst = LeesInst(); } catch ( ... ) {}
		std::map<std::string, std::string> metBlok;
		std::vector<std::string> volgorde;
		for ( const Blok& b : Blokken( inst ) )
		{
			if ( b.klasse.empty() || b.klasse == "None" ) continue;
			auto i = metBlok.find( b.klasse );
			if ( i == metBlok.end() ) { metBlok[b.klasse] = b.nr.tekst; volgorde.push_back( b.klasse ); }
			else i->second += ", " + b.nr.tekst;
		}
		std::map<std::string, int> lampen;
		for ( MCObjectHandle h : Objecten( Pon( LD ) ) )
		{
			std::string k = KlasseVan( h );
			if ( ! k.empty() && k != "None" ) lampen[k]++;
		}
		auto natuurlijk = [](const std::string& a, const std::string& b) {
			size_t i = 0, j = 0;
			while ( i < a.size() && j < b.size() )
			{
				if ( std::isdigit( (unsigned char) a[i] ) && std::isdigit( (unsigned char) b[j] ) )
				{
					size_t i2 = i, j2 = j;
					while ( i2 < a.size() && std::isdigit( (unsigned char) a[i2] ) ) i2++;
					while ( j2 < b.size() && std::isdigit( (unsigned char) b[j2] ) ) j2++;
					long long x = std::stoll( a.substr( i, std::min<size_t>( 15, i2 - i ) ) ), y = std::stoll( b.substr( j, std::min<size_t>( 15, j2 - j ) ) );
					if ( x != y ) return x < y;
					i = i2; j = j2;
				}
				else
				{
					char x = (char) std::tolower( (unsigned char) a[i] ), y = (char) std::tolower( (unsigned char) b[j] );
					if ( x != y ) return x < y;
					i++; j++;
				}
			}
			return a.size() < b.size();
		};
		std::sort( volgorde.begin(), volgorde.end(), natuurlijk );
		for ( const std::string& k : volgorde )
		{
			std::string tekst = k + "  ·  " + metBlok[k];
			auto l = lampen.find( k );
			if ( l != lampen.end() ) tekst += "  ·  " + std::to_string( l->second ) + " lampen";
			uit.push_back( { k, tekst } );
		}
		std::vector<std::string> rest;
		for ( const auto& l : lampen ) if ( ! metBlok.count( l.first ) ) rest.push_back( l.first );
		std::sort( rest.begin(), rest.end(), natuurlijk );
		for ( const std::string& k : rest )
			uit.push_back( { k, k + "  ·  " + std::to_string( lampen[k] ) + " lampen, geen blok" } );
	}
	catch ( ... ) {}
	return uit;
}
