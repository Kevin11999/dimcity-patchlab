#include "StdAfx.h"

#include <algorithm>
#include <array>
#include <cctype>
#include <cmath>
#include <cstdio>
#include <fstream>
#include <functional>
#include <map>
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
	const char* LAAG_LAMPEN = "Lightplot";		// laag voor de lampen van de demo-show

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

	json LeesProject() { return LeesJson( BasisVerplicht() + ".kt-project.json" ); }

	// Instellingen: standaard + wat de palette in het projectbestand heeft gezet
	struct Inst
	{
		std::string prefix		= "PP/";
		double symboolBreedte	= 13;
		double symboolHoogte	= 4;
		double dimcityMaat		= 1;
		double dimcityKast		= 2;
		double dropSymbool		= 0.3;
		std::string kleurDB		= "#ff0000";
		std::string kleurDrop	= "#33cc00";
		std::string laagCabling	= "Cabling";
		std::string laagInfra	= "Infraplot";
		std::string laagKabels	= "Cabling";
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
			inst.symboolBreedte	= Num( s, "symboolBreedte", inst.symboolBreedte );
			inst.symboolHoogte	= Num( s, "symboolHoogte", inst.symboolHoogte );
			inst.dimcityMaat	= Num( s, "dimcityMaat", inst.dimcityMaat );
			inst.dimcityKast	= Num( s, "dimcityKast", inst.dimcityKast );
			inst.dropSymbool	= Num( s, "dropSymbool", inst.dropSymbool );
			inst.kleurDB		= Tekst( s, "kleurDB", inst.kleurDB );
			inst.kleurDrop		= Tekst( s, "kleurDrop", inst.kleurDrop );
			if ( s.contains( "kabels3D" ) && s["kabels3D"].is_boolean() ) inst.kabels3D = s["kabels3D"].get<bool>();
			if ( s.contains( "kabels2D" ) && s["kabels2D"].is_boolean() ) inst.kabels2D = s["kabels2D"].get<bool>();
		}
		if ( inst.laagCabling.empty() )	inst.laagCabling = "Cabling";
		if ( inst.laagInfra.empty() )	inst.laagInfra = "Infraplot";
		if ( inst.laagKabels.empty() )	inst.laagKabels = inst.laagCabling;
		if ( inst.symboolBreedte <= 0 )	inst.symboolBreedte = 13;
		if ( inst.symboolHoogte <= 0 )	inst.symboolHoogte = 4;
		if ( inst.dimcityMaat <= 0 )	inst.dimcityMaat = 1;
		if ( inst.dimcityKast < 0 )		inst.dimcityKast = 0;
		if ( inst.dropSymbool <= 0 )	inst.dropSymbool = 0.3;
		return inst;
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
		for ( const char* n : { KT_DIMCITY, KT_DROP, KT_ROUTE, KT_LABEL, KT_KABEL } )
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
		Afmaken( h, inst.prefix + naam, Laag( inst.laagCabling ), undo );
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
		std::string id, trussNaam;
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

		uit = { "D" + std::to_string( Volgende( KT_DROP, "D" ) ), best->naam, bestQ[0], bestQ[1], bestQ[2] };
		MCObjectHandle h = MaakPunt( KT_DROP, bestQ[0], bestQ[1] );
		ZetPar( h, "ktId", uit.id );
		ZetPar( h, "truss", best->id );
		ZetParReal( h, "z", bestQ[2] );
		ZetParReal( h, "symboolMaat", inst.dropSymbool );
		ZetPar( h, "kleur", inst.kleurDrop );
		Afmaken( h, inst.prefix + best->naam, Laag( inst.laagCabling ), undo );
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

	void TrussenEnLampen(json& data)
	{
		json trussen = json::array(), lampen = json::array();
		for ( MCObjectHandle h : Objecten( "(ALL)" ) )
		{
			short t = gSDK->GetObjectTypeN( h );
			if ( t != kParametricNode && t != kSymbolNode ) continue;
			if ( IsKt( h ) ) continue;
			std::string soort = NaamVanSoort( h );
			P3 mn, mx;
			if ( soort == LD )
			{
				if ( ! Kubus( h, mn, mx ) ) continue;
				std::string naam = Veld( h, LD, "Inst Type" ) + " " + Veld( h, LD, "Unit Number" );
				while ( ! naam.empty() && naam.back() == ' ' ) naam.pop_back();
				while ( ! naam.empty() && naam.front() == ' ' ) naam.erase( 0, 1 );
				lampen.push_back( { { "uuid", Uuid( h ) }, { "naam", naam }, { "type", Veld( h, LD, "Inst Type" ) }, { "laag", LaagVan( h ) }, { "drop", Veld( h, LINK, "drop" ) },
									{ "x", ( mn[0] + mx[0] ) / 2 }, { "y", ( mn[1] + mx[1] ) / 2 }, { "z", ( mn[2] + mx[2] ) / 2 } } );
			}
			else if ( Klein( soort ).find( "truss" ) != std::string::npos )
			{
				if ( ! Kubus( h, mn, mx ) ) continue;
				trussen.push_back( { { "naam", soort }, { "klasse", KlasseVan( h ) }, { "laag", LaagVan( h ) },
									 { "min", json::array( { mn[0], mn[1], mn[2] } ) }, { "max", json::array( { mx[0], mx[1], mx[2] } ) } } );
			}
		}
		data["trussen"] = trussen;
		data["alleLampen"] = lampen;
		data["lagen"] = Lagen();
	}

	// --------------------------------------------------------------------------------------------------------
	// Uitwisselen met de palette
	json Exporteer()
	{
		std::string b = BasisVerplicht();
		ZorgRecords();
		json data = {
			{ "versie", 2 }, { "dimcities", json::array() }, { "vloerroutes", json::array() }, { "trusslijnen", json::array() },
			{ "drops", json::array() }, { "lampen", json::array() }, { "selectie", json::array() } };

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
		for ( MCObjectHandle h : Objecten( Pon( KT_ROUTE ) ) )
		{
			std::string id = Par( h, "ktId" );
			json r = { { "id", id }, { "uuid", Uuid( h ) }, { "punten", NaarJson( RoutePunten( h ) ) }, { "laag", LaagVan( h ) },
					   { "locatie", Par( h, "locatie" ) } };
			if ( Par( h, "soort" ) == "Truss" )
			{
				std::string naam = Par( h, "naam" );
				r["naam"] = naam;
				r["klasse"] = naam;
				data["trusslijnen"].push_back( r );
			}
			else
				data["vloerroutes"].push_back( r );
		}
		for ( MCObjectHandle h : Objecten( Pon( KT_DROP ) ) )
		{
			P3 p = Positie( h );
			double val = ParReal( h, "valhoogte", 0 );
			data["drops"].push_back( { { "id", Par( h, "ktId" ) }, { "uuid", Uuid( h ) }, { "truss", Par( h, "truss" ) },
									   { "x", p[0] }, { "y", p[1] }, { "z", ParReal( h, "z", 0 ) }, { "laag", LaagVan( h ) },
									   { "objectnaam", Par( h, "objectnaam" ) }, { "valhoogte", val > 0 ? json( val ) : json( "" ) },
									   { "slingers", ParReal( h, "slingers", 1 ) } } );
		}
		for ( MCObjectHandle h : Objecten( MetRecord( LINK ) ) )
		{
			std::string naam = Veld( h, LD, "Inst Type" ) + " " + Veld( h, LD, "Unit Number" );
			while ( ! naam.empty() && naam.back() == ' ' ) naam.pop_back();
			while ( ! naam.empty() && naam.front() == ' ' ) naam.erase( 0, 1 );
			data["lampen"].push_back( { { "uuid", Uuid( h ) }, { "naam", naam }, { "drop", Veld( h, LINK, "drop" ) } } );
		}
		for ( const char* pon : { KT_DIMCITY, KT_DROP, KT_ROUTE } )
			for ( MCObjectHandle h : Objecten( "(SEL=TRUE) & " + Pon( pon ) ) )
				data["selectie"].push_back( Par( h, "ktId" ) );

		for ( const char* lijst : { "dimcities", "vloerroutes", "trusslijnen", "drops" } )
		{
			json& a = data[lijst];
			std::sort( a.begin(), a.end(), [](const json& p, const json& q) {
				std::string i = p.value( "id", "" ), j = q.value( "id", "" );
				return i.size() != j.size() ? i.size() < j.size() : i < j;
			} );
		}

		TrussenEnLampen( data );
		SchrijfJson( b + ".kt-tekening.json", data );
		return data;
	}

	void SelecteerId(const std::string& doel)
	{
		if ( doel.empty() ) return;
		gSDK->DeselectAll();
		for ( const char* pon : { KT_DIMCITY, KT_DROP, KT_ROUTE } )
			for ( MCObjectHandle h : Objecten( Pon( pon ) ) )
				if ( Par( h, "ktId" ) == doel ) gSDK->SelectObject( h, true );
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
			double val = Num( d, "valhoogte", 0 ), sl = Num( d, "slinger", 1 );
			bool anders = naam != Par( h, "objectnaam" ) || std::abs( val - ParReal( h, "valhoogte", 0 ) ) > 1e-6
						|| std::abs( sl - ParReal( h, "slingers", 1 ) ) > 1e-6;
			if ( ! anders ) continue;
			if ( ! undo ) undo.reset( new Undo( "Kabeltool: drop-instellingen" ) );
			undo->VoorWijziging( h );
			ZetPar( h, "objectnaam", naam );
			ZetParReal( h, "valhoogte", val );
			ZetParReal( h, "slingers", sl );
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
		Meld( std::to_string( nl ) + " labels en " + std::to_string( nk ) + " kabelstukken getekend." );
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
			ZetKlasse( h, inst.prefix + d.trussNaam );
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
		for ( const char* pon : { KT_DIMCITY, KT_DROP, KT_ROUTE } )
			if ( ! Objecten( Pon( pon ) ).empty() )
			{
				Meld( "Deze tekening heeft al Kabeltool-objecten. Maak de demo-show in een nieuwe, lege tekening." );
				return;
			}
		Undo undo( "Kabeltool: demo-show" );

		MaakDimcity( 0, 0, inst, undo );
		MaakDimcity( 20, 0, inst, undo );

		// eerste punt = begin van de kabeltruss (aan de kant van de dim city)
		MaakRoute( { { 4, 10, 0 }, { 16, 10, 0 } }, true, "LX01", 8, inst.prefix + "LX01", inst.laagInfra, undo );
		MaakRoute( { { 16, 16, 0 }, { 4, 16, 0 } }, true, "LX02", 8, inst.prefix + "LX02", inst.laagInfra, undo );

		// vloerroutes van dim city naar de voet van de grote drop (begin van de truss)
		MaakRoute( { { 0, 0, 0 }, { 0, 10, 0 }, { 4, 10, 0 } }, false, "", 0, inst.prefix + "DB1", inst.laagCabling, undo );
		MaakRoute( { { 20, 0, 0 }, { 20, 16, 0 }, { 16, 16, 0 } }, false, "", 0, inst.prefix + "DB2", inst.laagCabling, undo );

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
			MaakDimcity( Num( a, "x", 0 ), Num( a, "y", 0 ), inst, undo );
		}
		else if ( functie == "drop" )
		{
			Undo undo( "Kabeltool: drop" );
			Drop d;
			MaakDrop( Num( a, "x", 0 ), Num( a, "y", 0 ), inst, undo, d );
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
			Undo undo( "Kabeltool: truss-lijn" );
			MaakRoute( pts, true, naam, Num( a, "hoogte", 8 ), inst.prefix + naam, inst.laagInfra, undo );
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
		else if ( functie == "opruimen" )
		{
			Inst inst = LeesInst();
			LagenOpruimen( { inst.laagCabling, inst.laagInfra, inst.laagKabels, LAAG_LAMPEN } );
		}
		else throw Stop{ "Onbekende functie: " + functie };

		// na een actie die de tekening verandert: geometriebestand bijwerken
		if ( functie != "laad" && functie != "bewaar" && functie != "selectie" && functie != "selecteer" )
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
