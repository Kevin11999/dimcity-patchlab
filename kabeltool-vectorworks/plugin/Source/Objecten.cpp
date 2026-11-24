#include "StdAfx.h"

#include <algorithm>
#include <cmath>
#include <string>
#include <vector>

#include "Kabeltool.h"
#include "Objecten.h"

using namespace Kabeltool;

// Eigen Kabeltool-objecten. Alle maten in de Object Info zijn in meters, behalve de labelmaten (mm op papier)
// en de kabeldiameter (mm). Vectorworks rekent intern in millimeters.

namespace
{
	const double MM = 1000.0;

	// ---------------------------------------------------------------------------------------------------- hulpjes
	double Real(const VWParametricObj& o, const char* naam, double standaard)
	{
		try { return o.GetParamReal( naam ); }
		catch ( ... ) { return standaard; }
	}

	std::string Str(const VWParametricObj& o, const char* naam)
	{
		try { return o.GetParamString( naam ).GetStdString(); }
		catch ( ... ) { return ""; }
	}

	bool Bool(const VWParametricObj& o, const char* naam, bool standaard)
	{
		try { return o.GetParamBool( naam ); }
		catch ( ... ) { return standaard; }
	}

	CRGBColor Kleur(const std::string& hex, Uint8 r = 156, Uint8 g = 156, Uint8 b = 156)
	{
		std::string k = hex;
		if ( ! k.empty() && k[0] == '#' ) k.erase( 0, 1 );
		if ( k.size() < 6 ) return CRGBColor( r, g, b );
		try
		{
			return CRGBColor( (Uint8) std::stoi( k.substr( 0, 2 ), nullptr, 16 ),
							  (Uint8) std::stoi( k.substr( 2, 2 ), nullptr, 16 ),
							  (Uint8) std::stoi( k.substr( 4, 2 ), nullptr, 16 ) );
		}
		catch ( ... ) { return CRGBColor( r, g, b ); }
	}

	void Vul(MCObjectHandle h, const CRGBColor& kleur)
	{
		if ( ! h ) return;
		VWObjectAttr a( h );
		a.SetFillSolid();
		a.SetFillForeColor( kleur );
		a.SetFillBackColor( kleur );
	}

	void Pen(MCObjectHandle h, const CRGBColor& kleur)
	{
		if ( ! h ) return;
		VWObjectAttr a( h );
		a.SetPenForeColor( kleur );
		a.SetPenBackColor( kleur );
	}

	MCObjectHandle Tekst(const std::string& tekst, double x, double y, double punten, int uitlijning)
	{
		VWTextBlockObj t( TXString( tekst ), VWPoint2D( x, y ) );
		t.SetTextSizeByPoint( std::max( 2.0, punten ) );
		t.SetTextJustification( uitlijning == 1 ? kTextHorzAlign_Left : uitlijning == 3 ? kTextHorzAlign_Right : kTextHorzAlign_Center );
		t.SetTextVerticalAlignment( kTextVertAlign_CenterBox );
		return t.GetThisObject();
	}

	MCObjectHandle Lijn(double x1, double y1, double x2, double y2)
	{
		VWLine2DObj l( x1, y1, x2, y2 );
		return l.GetThisObject();
	}

	MCObjectHandle Rechthoek(double l, double t, double r, double b)
	{
		VWPolygon2DObj p;
		p.AddCornerVertex( l, t );
		p.AddCornerVertex( r, t );
		p.AddCornerVertex( r, b );
		p.AddCornerVertex( l, b );
		p.SetClosed( true );
		return p.GetThisObject();
	}

	MCObjectHandle Cirkel(double cx, double cy, double r, int n = 16)
	{
		VWPolygon2DObj p;
		for ( int i = 0; i < n; i++ )
		{
			double a = 2.0 * 3.14159265358979 * i / n;
			p.AddCornerVertex( cx + r * std::cos( a ), cy + r * std::sin( a ) );
		}
		p.SetClosed( true );
		return p.GetThisObject();
	}

	// Cilinder van a naar b (interne eenheden). Gaat via een extrude langs de richting a→b.
	MCObjectHandle Cilinder(VWPoint3D a, VWPoint3D b, double r, int n)
	{
		if ( a.DistanceTo( b ) < 0.5 ) return nullptr;
		// de extrude-hulp van de SDK draait niet bij een kaarsrechte lijn omlaag: dan van laag naar hoog
		VWPoint3D d = b - a;
		if ( std::abs( d.x ) < 1e-6 && std::abs( d.y ) < 1e-6 && d.z < 0 ) std::swap( a, b );
		MCObjectHandle basis = Cirkel( 0, 0, r, n );
		VWExtrudeObj e( basis, a, b );
		return e.GetThisObject();
	}

	// ---------------------------------------------------------------------------------------------------- labels
	void GeenVulling(MCObjectHandle h)
	{
		if ( ! h ) return;
		VWObjectAttr a( h );
		a.SetFillNone();
	}

	MCObjectHandle TekstKleur(const std::string& tekst, double x, double y, double punten, int uitlijning, const CRGBColor& kleur, bool vet)
	{
		MCObjectHandle h = Tekst( tekst, x, y, punten, uitlijning );
		if ( ! h ) return h;
		VWTextBlockObj t( h );
		t.SetTextColor( kleur );
		if ( vet ) t.SetTextStyle( kTextStyle_Bold );
		return h;
	}

	// Golvende lijn (zoals Kevin zijn drops tekent) van a naar b
	MCObjectHandle Golflijn(double ax, double ay, double bx, double by)
	{
		double dx = bx - ax, dy = by - ay;
		VWPolygon2DObj p;
		p.AddCornerVertex( ax, ay );
		p.AddCubicVertex( VWPoint2D( ax + dx * 0.10, ay + dy * 0.55 ) );
		p.AddCubicVertex( VWPoint2D( ax + dx * 0.30, ay + dy * 0.80 ) );
		p.AddCubicVertex( VWPoint2D( ax + dx * 0.50, ay + dy * 0.62 ) );
		p.AddCubicVertex( VWPoint2D( ax + dx * 0.62, ay + dy * 0.95 ) );
		p.AddCubicVertex( VWPoint2D( ax + dx * 0.82, ay + dy * 1.02 ) );
		p.AddCornerVertex( bx, by );
		p.SetClosed( false );
		GeenVulling( p.GetThisObject() );
		return p.GetThisObject();
	}

	// Kabelsymbool: wit blokje met rand in typekleur, dunne balk bovenop in lengtekleur,
	// korte naam links (vet bij VEAM), lengte rechts, nummer grijs ernaast.
	void Kabelsymbool(double x, double top, double B, double H, double hoogtePapier, const LabelRij& r)
	{
		double balk = H * 0.16;
		MCObjectHandle blok = Rechthoek( x, top, x + B, top - H );
		Vul( blok, CRGBColor( 255, 255, 255 ) );
		Pen( blok, Kleur( r.rand, 0, 0, 0 ) );
		MCObjectHandle b = Rechthoek( x, top, x + B, top - balk );
		CRGBColor kb = Kleur( r.kleur, 255, 255, 255 );
		Vul( b, kb );
		Pen( b, CRGBColor( 0, 0, 0 ) );						// ook een witte balk blijft zo zichtbaar
		double my = top - balk - ( H - balk ) / 2.0;
		double pt = hoogtePapier * 0.62 / 0.3528;
		TekstKleur( r.kort, x + H * 0.25, my, pt, 1, CRGBColor( 0, 0, 0 ), r.vet == "1" );
		TekstKleur( r.lengte, x + B - H * 0.25, my, pt, 3, CRGBColor( 0, 0, 0 ), false );
		if ( ! r.nummer.empty() )
			TekstKleur( r.nummer, x + B + H * 0.25, my, pt, 1, CRGBColor( 119, 119, 119 ), false );
	}

	// Kader met titel en kabelsymbolen; links-onder op (x, y). Geeft breedte en hoogte terug.
	void Kader(const std::vector<LabelRij>& rijen, const std::string& titel, double x, double y, double B, double H,
			   double hoogtePapier, const CRGBColor& kleur, bool metRand, double& breedte, double& hoogte)
	{
		double pad = H * 0.3, gat = H * 0.25;
		size_t langste = 1;
		for ( const LabelRij& r : rijen ) langste = std::max( langste, r.nummer.size() );
		double nrB = langste * H * 0.62 * 0.62 + H * 0.4;
		breedte = pad + B + nrB + pad;
		hoogte = pad * 2 + rijen.size() * ( H + gat ) - ( rijen.empty() ? 0 : gat );
		if ( metRand )
		{
			MCObjectHandle k = Rechthoek( x, y + hoogte, x + breedte, y );
			Vul( k, CRGBColor( 255, 255, 255 ) );
			Pen( k, kleur );
			VWObjectAttr( k ).SetLineWeightInMils( 14 );
		}
		if ( ! titel.empty() )
			TekstKleur( titel, x, y + hoogte + H * 0.55, hoogtePapier * 0.8 / 0.3528, 1, kleur, false );
		for ( size_t i = 0; i < rijen.size(); i++ )
			Kabelsymbool( x + pad, y + hoogte - pad - i * ( H + gat ), B, H, hoogtePapier, rijen[i] );
	}

	void TekenBlok(const VWParametricObj& o, double H, double hoogtePapier, const std::vector<LabelRij>& rijen)
	{
		std::string soort = Str( o, "blokSoort" ), titel = Str( o, "titel" ), letter = Str( o, "letter" );
		CRGBColor rood = Kleur( Str( o, "kader" ), 229, 57, 53 );
		int n = std::max( 1, (int) Real( o, "poorten", 6 ) );
		double top = -H * 1.5 - Real( o, "rijNr", 0 ) * H * 4.0;
		double lip = H * 0.3;

		auto Lippen = [&](double l, double t, double r, double b) {
			double mid = ( t + b ) / 2.0, half = std::min( H * 0.35, ( t - b ) * 0.3 );
			Pen( Rechthoek( l - lip, mid + half, l, mid - half ), rood );
			Pen( Rechthoek( r, mid + half, r + lip, mid - half ), rood );
		};

		if ( soort == "breakout" )
		{
			double r = H * 0.42, w = n * r * 2.3 + H * 0.4, h = H * 1.3;
			MCObjectHandle k = Rechthoek( 0, top, w, top - h );
			Vul( k, CRGBColor( 255, 255, 255 ) );
			Pen( k, rood );
			Lippen( 0, top, w, top - h );
			for ( int i = 0; i < n; i++ )
				Cirkel( H * 0.2 + r * 1.15 + i * r * 2.3, top - h / 2.0, r, 20 );
			TekstKleur( letter.empty() ? "M" : letter.substr( 0, 2 ), w + lip + H * 0.3, top - h / 2.0, hoogtePapier * 1.6 / 0.3528, 1, CRGBColor( 0, 0, 0 ), false );
			if ( ! titel.empty() )
				TekstKleur( titel, 0, top - h - H * 0.5, hoogtePapier * 0.6 / 0.3528, 1, CRGBColor( 0, 0, 0 ), false );
			return;
		}

		// splitter: rood blok met naam, de poorten met wat erop zit, en lipjes
		double regel = H * 0.6, w = H * 7.0, h = regel * ( n + 1.6 );
		MCObjectHandle k = Rechthoek( 0, top, w, top - h );
		Vul( k, CRGBColor( 255, 255, 255 ) );
		Pen( k, rood );
		Lippen( 0, top, w, top - h );
		TekstKleur( titel, w / 2.0, top - regel * 0.7, hoogtePapier * 0.55 / 0.3528, 2, CRGBColor( 0, 0, 0 ), false );
		for ( int i = 0; i < n; i++ )
		{
			std::string t = i < (int) rijen.size() ? rijen[i].kort : std::to_string( i + 1 ) + ":";
			TekstKleur( t, H * 0.3, top - regel * ( 1.6 + i ), hoogtePapier * 0.4 / 0.3528, 1, rood, false );
		}
		if ( ! letter.empty() )
			TekstKleur( letter, w + lip + H * 0.3, top - h / 2.0, hoogtePapier * 1.6 / 0.3528, 1, rood, false );
	}

	void TekenLabel(const VWParametricObj& o)
	{
		std::string soort = Str( o, "soort" ), titel = Str( o, "titel" );
		std::vector<LabelRij> rijen = LeesRijen( Str( o, "rijen1" ) + ";" + Str( o, "rijen2" ) + ";" + Str( o, "rijen3" ) + ";" + Str( o, "rijen4" ) );
		double breedte	= std::max( 1.0, Real( o, "breedte", 13 ) );
		double hoogte	= std::max( 0.5, Real( o, "hoogte", 4 ) );
		double mm		= Real( o, "schaal", 1 );
		if ( mm <= 0 ) mm = 1;
		double B = breedte * mm, H = hoogte * mm;
		CRGBColor kleur = Kleur( Str( o, "kader" ), 0, 0, 0 );
		double kb = 0, kh = 0;

		if ( soort == "streepje" )							// lengtehulp
		{
			double nx = Real( o, "nx", 0 ) * H, ny = Real( o, "ny", 1 ) * H;
			GeenVulling( Lijn( -nx, -ny, nx, ny ) );
			Tekst( titel, nx * 1.8, ny * 1.8, hoogte * 0.5 / 0.3528, 2 );
			return;
		}
		if ( soort == "blok" )
		{
			TekenBlok( o, H, hoogte, rijen );
			return;
		}
		if ( soort == "vlag" || soort == "bol" )			// drop: groen rondje, golflijn, groen kader
		{
			double r = H * 0.65;
			MCObjectHandle bol = Cirkel( 0, 0, r, 24 );
			Vul( bol, kleur );
			Pen( bol, kleur );
			double kx = H * 4.0, ky = H * 1.2;
			Pen( Golflijn( r * 0.8, r * 0.6, kx, ky ), kleur );
			Kader( rijen, titel, kx, ky, B, H, hoogte, kleur, true, kb, kh );
			return;
		}
		if ( soort == "koppel" )							// route/koppelpunt: rood rondje, lijn, rood kader
		{
			double r = H * 0.55;
			MCObjectHandle bol = Cirkel( 0, 0, r, 24 );
			Vul( bol, kleur );
			Pen( bol, kleur );
			double kx = H * 3.0, ky = -H * 1.0;
			Kader( rijen, titel, kx, ky, B, H, hoogte, kleur, true, kb, kh );
			Pen( Lijn( r, 0, kx, ky + kh / 2.0 ), kleur );
			return;
		}
		if ( soort == "dimcity" )							// DB: titel en kabels naast het vlak
		{
			double ox = Real( o, "dcMaat", 1 ) * MM * 0.6 + H;
			Kader( rijen, "", ox, -H * 0.5, B, H, hoogte, kleur, false, kb, kh );
			return;
		}
		Kader( rijen, titel, H * 2.0, H * 1.0, B, H, hoogte, kleur, true, kb, kh );
	}

	// ---------------------------------------------------------------------------------------------------- definities
	SParametricDef gDefDimCity	= { { "KTDimCity", "localized_name" },		kParametricSubType_Point,	true, true, false, false, false, false };
	SParametricDef gDefDrop		= { { "KTDrop", "localized_name" },			kParametricSubType_Point,	true, true, false, false, false, false };
	SParametricDef gDefRoute	= { { "KTKabelroute", "localized_name" },	kParametricSubType_2DPath,	true, true, false, false, false, false };
	SParametricDef gDefLabel	= { { "KTKabellabel", "localized_name" },	kParametricSubType_Point,	true, true, false, false, false, false };
	SParametricDef gDefKabel	= { { "KTKabel", "localized_name" },		kParametricSubType_3DPath,	true, true, false, false, false, false };

	SParametricParamChc gGeenKeuzes[] = {
		{ 0, "", { 0, 0 } }
	};

	SParametricParamChc gRouteKeuzes[] = {
		{ 130, "Vloer",	{ "KTKabelroute", "keuze_vloer" } },
		{ 130, "Truss",	{ "KTKabelroute", "keuze_truss" } },
		{ 0, "", { 0, 0 } }
	};

	SParametricParam2Def gParDimCity[] = {
		{ "naam",		{ "KTDimCity", "p_naam" },			kFieldText },
		{ "maat",		{ "KTDimCity", "p_maat" },			kFieldReal },
		{ "kastHoogte",	{ "KTDimCity", "p_kastHoogte" },	kFieldReal },
		{ "toonNaam",	{ "KTDimCity", "p_toonNaam" },		kFieldBoolean },
		{ "kleur",		{ "KTDimCity", "p_kleur" },			kFieldText },
		{ "ktId",		{ "KTDimCity", "p_ktId" },			kFieldText },
		{ }
	};

	SParametricParam2Def gParDrop[] = {
		{ "objectnaam",	{ "KTDrop", "p_objectnaam" },		kFieldText },
		{ "valhoogte",	{ "KTDrop", "p_valhoogte" },		kFieldReal },
		{ "slingers",	{ "KTDrop", "p_slingers" },			kFieldReal },
		{ "z",			{ "KTDrop", "p_z" },				kFieldReal },
		{ "symboolMaat",{ "KTDrop", "p_symboolMaat" },		kFieldReal },
		{ "kleur",		{ "KTDrop", "p_kleur" },			kFieldText },
		{ "ktId",		{ "KTDrop", "p_ktId" },				kFieldText },
		{ "truss",		{ "KTDrop", "p_truss" },			kFieldText },
		{ }
	};

	SParametricParam2Def gParRoute[] = {
		{ "soort",		{ "KTKabelroute", "p_soort" },		kFieldPopUp, 130 },
		{ "naam",		{ "KTKabelroute", "p_naam" },		kFieldText },
		{ "hoogte",		{ "KTKabelroute", "p_hoogte" },		kFieldReal },
		{ "locatie",	{ "KTKabelroute", "p_locatie" },	kFieldText },
		{ "ktId",		{ "KTKabelroute", "p_ktId" },		kFieldText },
		{ }
	};

	SParametricParam2Def gParLabel[] = {
		{ "soort",		{ "KTKabellabel", "p_soort" },		kFieldText },
		{ "titel",		{ "KTKabellabel", "p_titel" },		kFieldText },
		{ "breedte",	{ "KTKabellabel", "p_breedte" },	kFieldReal },
		{ "hoogte",		{ "KTKabellabel", "p_hoogte" },		kFieldReal },
		{ "schaal",		{ "KTKabellabel", "p_schaal" },		kFieldReal },
		{ "rijen1",		{ "KTKabellabel", "p_rijen1" },		kFieldText },
		{ "rijen2",		{ "KTKabellabel", "p_rijen2" },		kFieldText },
		{ "rijen3",		{ "KTKabellabel", "p_rijen3" },		kFieldText },
		{ "rijen4",		{ "KTKabellabel", "p_rijen4" },		kFieldText },
		{ "nx",			{ "KTKabellabel", "p_nx" },			kFieldReal },
		{ "ny",			{ "KTKabellabel", "p_ny" },			kFieldReal },
		{ "rijNr",		{ "KTKabellabel", "p_rijNr" },		kFieldReal },
		{ "dcMaat",		{ "KTKabellabel", "p_dcMaat" },		kFieldReal },
		{ "kader",		{ "KTKabellabel", "p_kader" },		kFieldText },
		{ "blokSoort",	{ "KTKabellabel", "p_blokSoort" },	kFieldText },
		{ "poorten",	{ "KTKabellabel", "p_poorten" },	kFieldReal },
		{ "letter",		{ "KTKabellabel", "p_letter" },		kFieldText },
		{ }
	};

	SParametricParam2Def gParKabel[] = {
		{ "nummer",		{ "KTKabel", "p_nummer" },			kFieldText },
		{ "type",		{ "KTKabel", "p_type" },			kFieldText },
		{ "kort",		{ "KTKabel", "p_kort" },			kFieldText },
		{ "lengte",		{ "KTKabel", "p_lengte" },			kFieldText },
		{ "totaal",		{ "KTKabel", "p_totaal" },			kFieldReal },
		{ "diameter",	{ "KTKabel", "p_diameter" },		kFieldReal },
		{ "kleur",		{ "KTKabel", "p_kleur" },			kFieldText },
		{ "toon2D",		{ "KTKabel", "p_toon2D" },			kFieldBoolean },
		{ }
	};
}

std::vector<LabelRij> Kabeltool::LeesRijen(const std::string& tekst)
{
	std::vector<LabelRij> uit;
	size_t begin = 0;
	while ( begin <= tekst.size() )
	{
		size_t eind = tekst.find( ';', begin );
		if ( eind == std::string::npos ) eind = tekst.size();
		std::string rij = tekst.substr( begin, eind - begin );
		if ( ! rij.empty() )
		{
			std::vector<std::string> d;
			size_t b = 0;
			while ( true )
			{
				size_t e = rij.find( '|', b );
				d.push_back( rij.substr( b, e == std::string::npos ? std::string::npos : e - b ) );
				if ( e == std::string::npos ) break;
				b = e + 1;
			}
			d.resize( 6 );
			uit.push_back( { d[0], d[1], d[2], d[3], d[4], d[5] } );
		}
		begin = eind + 1;
	}
	return uit;
}

// ------------------------------------------------------------------------------------------------------------
// {311D2380-529D-4B5E-B950-E036396E5836}
IMPLEMENT_VWParametricExtension( CExtDimCity, CDimCity_EventSink, KT_DIMCITY, 1,
	0x311d2380, 0x529d, 0x4b5e, 0xb9, 0x50, 0xe0, 0x36, 0x39, 0x6e, 0x58, 0x36 );
// {90201F64-15E0-4014-ADD3-F761C3AE4AB7}
IMPLEMENT_VWParametricExtension( CExtDrop, CDrop_EventSink, KT_DROP, 1,
	0x90201f64, 0x15e0, 0x4014, 0xad, 0xd3, 0xf7, 0x61, 0xc3, 0xae, 0x4a, 0xb7 );
// {E899AD99-EEEA-4CF9-8ACA-1FC3C02124C3}
IMPLEMENT_VWParametricExtension( CExtRoute, CRoute_EventSink, KT_ROUTE, 1,
	0xe899ad99, 0xeeea, 0x4cf9, 0x8a, 0xca, 0x1f, 0xc3, 0xc0, 0x21, 0x24, 0xc3 );
// {9D125BC7-D42A-4A6E-B1AF-682C7D4A3922}
IMPLEMENT_VWParametricExtension( CExtLabel, CLabel_EventSink, KT_LABEL, 1,
	0x9d125bc7, 0xd42a, 0x4a6e, 0xb1, 0xaf, 0x68, 0x2c, 0x7d, 0x4a, 0x39, 0x22 );
// {03E5653C-0FAF-47BE-B804-9D00EBC706B4}
IMPLEMENT_VWParametricExtension( CExtKabel, CKabel_EventSink, KT_KABEL, 1,
	0x03e5653c, 0x0faf, 0x47be, 0xb8, 0x04, 0x9d, 0x00, 0xeb, 0xc7, 0x06, 0xb4 );

CExtDimCity::CExtDimCity(CallBackPtr cbp)	: VWExtensionParametric( cbp, gDefDimCity, gParDimCity, gGeenKeuzes ) {}
CExtDimCity::~CExtDimCity() {}
CExtDrop::CExtDrop(CallBackPtr cbp)			: VWExtensionParametric( cbp, gDefDrop, gParDrop, gGeenKeuzes ) {}
CExtDrop::~CExtDrop() {}
CExtRoute::CExtRoute(CallBackPtr cbp)		: VWExtensionParametric( cbp, gDefRoute, gParRoute, gRouteKeuzes ) {}
CExtRoute::~CExtRoute() {}
CExtLabel::CExtLabel(CallBackPtr cbp)		: VWExtensionParametric( cbp, gDefLabel, gParLabel, gGeenKeuzes ) {}
CExtLabel::~CExtLabel() {}
CExtKabel::CExtKabel(CallBackPtr cbp)		: VWExtensionParametric( cbp, gDefKabel, gParKabel, gGeenKeuzes ) {}
CExtKabel::~CExtKabel() {}

CDimCity_EventSink::CDimCity_EventSink(IVWUnknown* parent)	: VWParametric_EventSink( parent ) {}
CDimCity_EventSink::~CDimCity_EventSink() {}
CDrop_EventSink::CDrop_EventSink(IVWUnknown* parent)		: VWParametric_EventSink( parent ) {}
CDrop_EventSink::~CDrop_EventSink() {}
CRoute_EventSink::CRoute_EventSink(IVWUnknown* parent)		: VWParametric_EventSink( parent ) {}
CRoute_EventSink::~CRoute_EventSink() {}
CLabel_EventSink::CLabel_EventSink(IVWUnknown* parent)		: VWParametric_EventSink( parent ) {}
CLabel_EventSink::~CLabel_EventSink() {}
CKabel_EventSink::CKabel_EventSink(IVWUnknown* parent)		: VWParametric_EventSink( parent ) {}
CKabel_EventSink::~CKabel_EventSink() {}

// ------------------------------------------------------------------------------------------------------------
// Dim city: vierkant met naam (2D), kast (3D)
EObjectEvent CDimCity_EventSink::Recalculate()
{
	try
	{
		VWParametricObj o( fhObject );
		double s		= std::max( 0.05, Real( o, "maat", 1 ) ) * MM / 2.0;
		double kast		= std::max( 0.0, Real( o, "kastHoogte", 2 ) ) * MM;
		std::string naam = Str( o, "naam" );
		if ( naam.empty() ) naam = Str( o, "ktId" );
		CRGBColor kleur = Kleur( Str( o, "kleur" ), 255, 0, 0 );

		MCObjectHandle vlak = Rechthoek( -s, s, s, -s );
		Vul( vlak, kleur );
		Pen( vlak, CRGBColor( 0, 0, 0 ) );
		if ( Bool( o, "toonNaam", true ) && ! naam.empty() )
		{
			// tekst op papier ongeveer 40% van de breedte van het vlak, rekening houdend met de laagschaal
			double schaal = 100;
			MCObjectHandle laag = VWObject( fhObject ).GetParentLayer();
			if ( laag ) gSDK->GetLayerScaleN( laag, schaal );
			if ( schaal <= 0 ) schaal = 100;
			double mmPapier = ( s * 2.0 / schaal ) * 0.8 / std::max<size_t>( naam.size(), 2 ) * 1.6;
			TekstKleur( naam, 0, 0, std::max( 6.0, std::min( 72.0, mmPapier / 0.3528 ) ), 2, CRGBColor( 255, 255, 255 ), true );
		}
		if ( kast > 1 )
		{
			MCObjectHandle basis = Rechthoek( -s, s, s, -s );
			VWExtrudeObj e( basis, VWPoint3D( 0, 0, 0 ), VWPoint3D( 0, 0, kast ) );
			Vul( e.GetThisObject(), kleur );
		}
	}
	catch ( ... ) { Log( "Dim city tekenen mislukt" ); }
	return kObjectEventNoErr;
}

// Drop: gevuld rondje (2D; het kader met de kabels komt van het label), drop naar beneden (3D)
EObjectEvent CDrop_EventSink::Recalculate()
{
	try
	{
		VWParametricObj o( fhObject );
		double r		= std::max( 0.05, Real( o, "symboolMaat", 0.3 ) ) * MM / 2.0;
		double z		= Real( o, "z", 8 ) * MM;
		double val		= Real( o, "valhoogte", 0 ) * MM;
		if ( val <= 0 || val > z ) val = z;
		CRGBColor kleur = Kleur( Str( o, "kleur" ), 51, 204, 0 );

		MCObjectHandle c = Cirkel( 0, 0, r, 24 );
		Vul( c, kleur );
		Pen( c, kleur );

		if ( z > 1 )
		{
			VWPolygon3DObj lijn;
			lijn.AddVertex( 0, 0, z );
			lijn.AddVertex( 0, 0, z - val );
			lijn.SetClosed( false );
			GeenVulling( lijn.GetThisObject() );
			Pen( lijn.GetThisObject(), kleur );
			MCObjectHandle bol = gSDK->CreateSphere( WorldPt3( 0, 0, z ), r * 0.5 );
			Vul( bol, kleur );
		}
	}
	catch ( ... ) { Log( "Drop tekenen mislukt" ); }
	return kObjectEventNoErr;
}

// Kabelroute: lijn (2D), op hoogte (3D). Bij een truss-lijn een rondje bij het begin van de kabeltruss.
EObjectEvent CRoute_EventSink::Recalculate()
{
	try
	{
		VWParametricObj o( fhObject );
		MCObjectHandle hp = gSDK->GetCustomObjectPath( fhObject );
		if ( ! hp ) return kObjectEventNoErr;
		bool truss = Str( o, "soort" ) == "Truss";
		double z = truss ? Real( o, "hoogte", 8 ) * MM : 0.0;

		std::vector<VWPoint2D> pts;
		short t = gSDK->GetObjectTypeN( hp );
		if ( t == kPolygonNode || t == kPolylineNode )
		{
			VWPolygon2DObj pad( hp );
			for ( size_t i = 0; i < pad.GetVertexCount(); i++ ) pts.push_back( pad.GetVertexPoint( i ) );
		}
		if ( pts.size() < 2 ) return kObjectEventNoErr;

		VWPolygon2DObj lijn;
		for ( const VWPoint2D& p : pts ) lijn.AddCornerVertex( p );
		lijn.SetClosed( false );
		GeenVulling( lijn.GetThisObject() );

		if ( truss )
		{
			double r = 0.15 * MM;
			GeenVulling( Cirkel( pts[0].x, pts[0].y, r, 16 ) );
			std::string naam = Str( o, "naam" );
			if ( ! naam.empty() ) Tekst( naam, pts[0].x - r * 1.5, pts[0].y + r * 1.5, 10, 3 );
		}

		VWPolygon3DObj lijn3d;
		for ( const VWPoint2D& p : pts ) lijn3d.AddVertex( p.x, p.y, z );
		lijn3d.SetClosed( false );
		GeenVulling( lijn3d.GetThisObject() );
	}
	catch ( ... ) { Log( "Kabelroute tekenen mislukt" ); }
	return kObjectEventNoErr;
}

// Kabellabel: kabelsymbolen, vlaggetje, koppelpunt, lengtehulp of blok (alleen 2D)
EObjectEvent CLabel_EventSink::Recalculate()
{
	try
	{
		VWParametricObj o( fhObject );
		TekenLabel( o );
	}
	catch ( ... ) { Log( "Kabellabel tekenen mislukt" ); }
	return kObjectEventNoErr;
}

// Kabel: buis langs het pad (3D), dunne lijn (2D)
EObjectEvent CKabel_EventSink::Recalculate()
{
	try
	{
		VWParametricObj o( fhObject );
		MCObjectHandle hp = gSDK->GetCustomObjectPath( fhObject );
		if ( ! hp || gSDK->GetObjectTypeN( hp ) != qPolyNode ) return kObjectEventNoErr;

		VWPolygon3DObj pad( hp );
		std::vector<VWPoint3D> pts;
		for ( size_t i = 0; i < pad.GetVertexCount(); i++ ) pts.push_back( pad.GetVertex( i ) );
		if ( pts.size() < 2 ) return kObjectEventNoErr;

		CRGBColor kleur = Kleur( Str( o, "kleur" ) );
		double r = std::max( 2.0, Real( o, "diameter", 20 ) ) / 2.0;		// mm
		int n = r > 10 ? 12 : 8;

		if ( Bool( o, "toon2D", true ) )
		{
			VWPolygon2DObj lijn;
			for ( const VWPoint3D& p : pts ) lijn.AddCornerVertex( p.x, p.y );
			lijn.SetClosed( false );
			GeenVulling( lijn.GetThisObject() );
			Pen( lijn.GetThisObject(), kleur );
		}

		for ( size_t i = 0; i + 1 < pts.size(); i++ )
		{
			MCObjectHandle c = Cilinder( pts[i], pts[i + 1], r, n );
			Vul( c, kleur );
			Pen( c, kleur );
		}
		for ( size_t i = 1; i + 1 < pts.size(); i++ )		// bochten netjes rond
		{
			MCObjectHandle bol = gSDK->CreateSphere( WorldPt3( pts[i].x, pts[i].y, pts[i].z ), r );
			Vul( bol, kleur );
			Pen( bol, kleur );
		}
	}
	catch ( ... ) { Log( "Kabel tekenen mislukt" ); }
	return kObjectEventNoErr;
}
