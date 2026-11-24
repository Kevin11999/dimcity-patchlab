#include "StdAfx.h"

#include <cmath>
#include <cstdio>
#include <string>
#include <utility>
#include <vector>

#include "Kabeltool.h"
#include "Tekening.h"
#include "Tools.h"

using namespace Kabeltool;

// Vectorworks rekent intern in millimeters; de Kabeltool rekent in meters.
static double Meter(double mm) { return mm / 1000.0; }

// Laatst gebruikte naam en hoogte van de truss-tool (blijven staan tot Vectorworks sluit).
static TXString gTrussNaam		= "CB01";
static TXString gTrussHoogte	= "auto";

// Laatst gekozen object (class) en dropvorm van de drop-tool
static TXString gDropKlasse		= "";
static TXString gDropVorm		= "Boog";

// --------------------------------------------------------------------------------------------------------
// Tooldefinities. Alle vier in categorie "Kabeltool" (zie Strings/*.vwstrings).
#define KABELTOOL_TOOLDEF(TStrings, TIcon)											\
	{																				\
		/*ToolType*/					eExtensionToolType_Normal,					\
		/*ParametricName*/				"",											\
		/*PickAndUpdate*/				ToolDef::pickAndUpdate,						\
		/*NeedScreenPlane*/				ToolDef::doesntNeedScreenPlane,				\
		/*Need3DProjection*/			ToolDef::doesntNeed3DView,					\
		/*Use2DCursor*/					ToolDef::use2DCursor,						\
		/*ConstrainCursor*/				ToolDef::constrainCursor,					\
		/*NeedPerspective*/				ToolDef::doesntNeedPerspective,				\
		/*ShowScreenHints*/				ToolDef::showScreenHints,					\
		/*NeedsPlanarContext*/			ToolDef::needsPlanarContext,				\
		/*Message*/						{TStrings, "message"},						\
		/*WaitMoveDistance*/			0,											\
		/*ConstraintFlags*/				0,											\
		/*BarDisplay*/					kToolBarDisplay_XYClLaZo,					\
		/*MinimumCompatibleVersion*/	900,										\
		/*Title*/						{TStrings, "Title"},						\
		/*Category*/					{TStrings, "Category"},						\
		/*HelpText*/					{TStrings, "HelpText"},						\
		/*VersionCreated*/				30,											\
		/*VersoinModified*/				0,											\
		/*VersoinRetired*/				0,											\
		/*OverrideHelpID*/				" ",										\
		/*Icon Specifier*/				"KabeltoolPalette/Images/" TIcon ".png",	\
		/*Cursor Specifier*/			""											\
	}

static SToolDef	gToolDimcity	= KABELTOOL_TOOLDEF( "ToolDimcity",	"ToolDimcity" );
static SToolDef	gToolDrop		= KABELTOOL_TOOLDEF( "ToolDrop",	"ToolDrop" );
static SToolDef	gToolVloer		= KABELTOOL_TOOLDEF( "ToolVloer",	"ToolVloer" );
static SToolDef	gToolTruss		= KABELTOOL_TOOLDEF( "ToolTruss",	"ToolTruss" );

// --------------------------------------------------------------------------------------------------------
// De universele namen staan ook in Kabeltool.cpp (OnTool), zodat de palette de tool kan kiezen.

// {E2186AAD-9C8C-4469-A142-BEC16221D706}
IMPLEMENT_VWToolExtension(
	/*Extension class*/	CExtToolDimcity,
	/*Event sink*/		CToolDimcity_EventSink,
	/*Universal name*/	"KabeltoolDimcity",
	/*Version*/			1,
	/*UUID*/			0xe2186aad, 0x9c8c, 0x4469, 0xa1, 0x42, 0xbe, 0xc1, 0x62, 0x21, 0xd7, 0x06 );

// {2EF77323-3B10-4B6E-8AA6-581B5DFEFD58}
IMPLEMENT_VWToolExtension(
	/*Extension class*/	CExtToolDrop,
	/*Event sink*/		CToolDrop_EventSink,
	/*Universal name*/	"KabeltoolDrop",
	/*Version*/			1,
	/*UUID*/			0x2ef77323, 0x3b10, 0x4b6e, 0x8a, 0xa6, 0x58, 0x1b, 0x5d, 0xfe, 0xfd, 0x58 );

// {25C6087A-FC1A-45BD-910E-7673D199C116}
IMPLEMENT_VWToolExtension(
	/*Extension class*/	CExtToolVloer,
	/*Event sink*/		CToolVloer_EventSink,
	/*Universal name*/	"KabeltoolVloer",
	/*Version*/			1,
	/*UUID*/			0x25c6087a, 0xfc1a, 0x45bd, 0x91, 0x0e, 0x76, 0x73, 0xd1, 0x99, 0xc1, 0x16 );

// {D3F0E5BD-CF6C-4EF6-8DE9-D07338296431}
IMPLEMENT_VWToolExtension(
	/*Extension class*/	CExtToolTruss,
	/*Event sink*/		CToolTruss_EventSink,
	/*Universal name*/	"KabeltoolTruss",
	/*Version*/			1,
	/*UUID*/			0xd3f0e5bd, 0xcf6c, 0x4ef6, 0x8d, 0xe9, 0xd0, 0x73, 0x38, 0x29, 0x64, 0x31 );

CExtToolDimcity::CExtToolDimcity(CallBackPtr cbp)	: VWExtensionTool( cbp, gToolDimcity )	{}
CExtToolDimcity::~CExtToolDimcity()														{}
CExtToolDrop::CExtToolDrop(CallBackPtr cbp)			: VWExtensionTool( cbp, gToolDrop )		{}
CExtToolDrop::~CExtToolDrop()															{}
CExtToolVloer::CExtToolVloer(CallBackPtr cbp)		: VWExtensionTool( cbp, gToolVloer )	{}
CExtToolVloer::~CExtToolVloer()															{}
CExtToolTruss::CExtToolTruss(CallBackPtr cbp)		: VWExtensionTool( cbp, gToolTruss )	{}
CExtToolTruss::~CExtToolTruss()															{}

// --------------------------------------------------------------------------------------------------------
// Eén klik
CToolKlik_EventSink::CToolKlik_EventSink(IVWUnknown* parent, const char* functie)
	: VWTool_EventSink( parent )
	, fFunctie( functie )
{
}

CToolKlik_EventSink::~CToolKlik_EventSink()
{
}

void CToolKlik_EventSink::HandleComplete()
{
	try
	{
		if ( this->GetToolPointsCount() < 1 )
			return;

		VWPoint2D pt = this->GetToolPt2D( 0 );

		nlohmann::json args;
		args["x"] = Meter( pt.x );
		args["y"] = Meter( pt.y );

		Log( "Tool " + fFunctie + ": klik" );
		if ( IsBezig() )
			return;
		ZetBezig( true );
		ToolUit( fFunctie, args );
		ZetBezig( false );
	}
	catch ( ... )
	{
		Log( "Tool " + fFunctie + ": C++-fout" );
	}
}

// --------------------------------------------------------------------------------------------------------
// Meerdere klikken
CToolLijn_EventSink::CToolLijn_EventSink(IVWUnknown* parent, const char* functie, bool metModusbalk)
	: VWTool_EventSink( parent )
	, fFunctie( functie )
	, fMetModusbalk( metModusbalk )
{
}

CToolLijn_EventSink::~CToolLijn_EventSink()
{
}

bool CToolLijn_EventSink::DoSetUp(bool bRestore, const IToolModeBarInitProvider* pModeBarInitProvider)
{
	if ( fMetModusbalk && ! bRestore && pModeBarInitProvider )
	{
		pModeBarInitProvider->AddEditTextModeGroup( "Naam", gTrussNaam );			// groep 0
		pModeBarInitProvider->AddEditTextModeGroup( "Hoogte (m of auto)", gTrussHoogte );	// groep 1
		pModeBarInitProvider->SetHelpString( "Klik over de truss; het eerste punt is het begin van de kabeltruss. Hoogte auto = bovenkant van de truss eronder. Dubbelklik = klaar." );
	}
	return true;
}

TToolStatus CToolLijn_EventSink::GetStatus(const IToolStatusProvider* pStatusProvider)
{
	// klikken tot dubbelklik (of klik op het laatste punt)
	return pStatusProvider->GetPolyToolStatus();
}

void CToolLijn_EventSink::Draw(IToolDrawProvider* pDrawProvider)
{
	// stukjes tussen de geklikte punten, het laatste naar de muis
	size_t n = this->GetToolPointsCount();
	for ( size_t i = 0; i + 1 <= n; i++ )
	{
		VWPoint2D a = this->GetToolPt2D( i );
		VWPoint2D b = this->GetToolPt2D( i + 1, true );
		pDrawProvider->DrawLine2D( VWLine2D( a, b ) );
	}
}

void CToolLijn_EventSink::HandleComplete()
{
	try
	{
		nlohmann::json punten = nlohmann::json::array();
		bool		eerste = true;
		VWPoint2D	vorige;
		size_t		n = this->GetToolPointsCount();
		for ( size_t i = 0; i < n; i++ )
		{
			VWPoint2D pt = this->GetToolPt2D( i );
			// dubbelklik geeft vaak twee keer hetzelfde punt
			if ( ! eerste && pt.DistanceTo( vorige ) < 1.0 )
				continue;
			punten.push_back( nlohmann::json::array( { Meter( pt.x ), Meter( pt.y ) } ) );
			vorige = pt;
			eerste = false;
		}

		nlohmann::json args;
		args["punten"] = punten;

		if ( fMetModusbalk && fpModeBarProvider )
		{
			TXString naam	= fpModeBarProvider->GetEditTextValue( 0 );
			TXString hoogte	= fpModeBarProvider->GetEditTextValue( 1 );
			if ( ! naam.IsEmpty() )		gTrussNaam		= naam;
			if ( ! hoogte.IsEmpty() )	gTrussHoogte	= hoogte;
		}
		if ( fMetModusbalk )
		{
			args["naam"]	= gTrussNaam.GetStdString();
			args["hoogte"]	= gTrussHoogte.GetStdString();
		}

		Log( "Tool " + fFunctie + ": " + std::to_string( (long long) punten.size() ) + " punten" );
		if ( IsBezig() )
			return;
		ZetBezig( true );
		ToolUit( fFunctie, args );
		ZetBezig( false );
	}
	catch ( ... )
	{
		Log( "Tool " + fFunctie + ": C++-fout" );
	}
}

// --------------------------------------------------------------------------------------------------------
// Drop in twee klikken
CToolDrop_EventSink::CToolDrop_EventSink(IVWUnknown* parent)
	: VWTool_EventSink( parent )
{
}

CToolDrop_EventSink::~CToolDrop_EventSink()
{
}

bool CToolDrop_EventSink::DoSetUp(bool bRestore, const IToolModeBarInitProvider* pModeBarInitProvider)
{
	try
	{
		ToolVoorbereiden();
		fHeeftSnap = false;
		if ( ! bRestore && pModeBarInitProvider )
		{
			IToolModeBarInitProvider* mb = const_cast<IToolModeBarInitProvider*>( pModeBarInitProvider );
			// groep 0: object (class), zoekbaar; eerst classes met blokken, dan classes met lampen
			mb->AddSearchablePullDownMenuModeGroup( "Object" );
			std::vector<std::pair<std::string, std::string>> klassen = DoelKlassen();
			bool gekozenBestaat = false;
			for ( const auto& k : klassen )
			{
				mb->AddSearchablePullDownMenuItem( 0, TXString( k.first ), TXString( k.second ), TXString( k.second ), "" );
				if ( TXString( k.first ) == gDropKlasse ) gekozenBestaat = true;
			}
			if ( ! gekozenBestaat ) gDropKlasse = klassen.empty() ? TXString( "" ) : TXString( klassen[0].first );
			if ( ! gDropKlasse.IsEmpty() ) mb->SetSearchaPullDownMenuSelection( 0, gDropKlasse );

			// groep 1: dropvorm
			mb->AddSearchablePullDownMenuModeGroup( "Dropvorm" );
			mb->AddSearchablePullDownMenuItem( 1, "Boog", "Nette boog", "Mooie boog, nooit lager dan het laagste punt", "" );
			mb->AddSearchablePullDownMenuItem( 1, "Recht", "Recht", "Strakke lijn van punt naar punt", "" );
			mb->AddSearchablePullDownMenuItem( 1, "Realistisch", "Realistisch", "Hangt door op basis van de droplengte", "" );
			mb->SetSearchaPullDownMenuSelection( 1, gDropVorm );

			mb->SetHelpString( klassen.empty()
				? "Geen blokken of lampen met een class gevonden. Klik 1 op de truss-lijn, klik 2 bij het object."
				: "Klik 1 op de truss-lijn (de kant van de muis = dropkant). Klik 2 bij het object." );
		}
	}
	catch ( ... ) { Log( "Drop-tool: voorbereiden mislukt" ); }
	return true;
}

void CToolDrop_EventSink::DoSetDown(bool bRestore, const IToolModeBarInitProvider* pModeBarInitProvider)
{
	Wis();
}

TToolStatus CToolDrop_EventSink::GetStatus(const IToolStatusProvider* pStatusProvider)
{
	return pStatusProvider->GetTwoPointToolStatus();
}

std::string CToolDrop_EventSink::Klasse()
{
	try
	{
		if ( fpModeBarProvider )
		{
			TXString k = fpModeBarProvider->GetSearchaPullDownMenuSelectedID( 0 );
			if ( ! k.IsEmpty() ) gDropKlasse = k;
		}
	}
	catch ( ... ) {}
	return gDropKlasse.GetStdString();
}

std::string CToolDrop_EventSink::Vorm()
{
	try
	{
		if ( fpModeBarProvider )
		{
			TXString v = fpModeBarProvider->GetSearchaPullDownMenuSelectedID( 1 );
			if ( ! v.IsEmpty() ) gDropVorm = v;
		}
	}
	catch ( ... ) {}
	return gDropVorm.GetStdString();
}

void CToolDrop_EventSink::Hulp(const std::string& tekst)
{
	try { if ( fpModeBarProvider ) fpModeBarProvider->SetHelpString( TXString( tekst ) ); }
	catch ( ... ) {}
}

// Na klik 1: het gesnapte punt en de kant vastleggen
void CToolDrop_EventSink::PointAdded()
{
	try
	{
		if ( this->GetToolPointsCount() != 1 ) return;
		VWPoint2D p = this->GetToolPt2D( 0 );
		TrussSnap s = SnapOpTruss( Meter( p.x ), Meter( p.y ) );
		fHeeftSnap = s.ok;
		if ( s.ok )
		{
			fSnapX = s.x * 1000.0; fSnapY = s.y * 1000.0; fRx = s.rx; fRy = s.ry;
			fKant = s.kant; fTruss = s.naam;
		}
	}
	catch ( ... ) { fHeeftSnap = false; }
}

void CToolDrop_EventSink::PointRemoved(bool bClearAllPts)
{
	if ( bClearAllPts || this->GetToolPointsCount() == 0 ) fHeeftSnap = false;
}

void CToolDrop_EventSink::MouseMove()
{
	Voorbeeld();
}

void CToolDrop_EventSink::Wis()
{
	try
	{
		VectorWorks::IToolInteractiveDrawPtr d;
		gSDK->GetCurrToolInteractiveDraw( & d );
		if ( d ) d->ClearObjects();
	}
	catch ( ... ) {}
}

// Voorbeeld tijdens het bewegen: kruisje op het gesnapte punt, pijl naar de dropkant, na klik 1 een lijn naar de muis
void CToolDrop_EventSink::Voorbeeld()
{
	try
	{
		VWPoint2D muis;
		if ( ! this->GetToolPtCurren2D( muis ) ) return;
		VectorWorks::IToolInteractiveDrawPtr d;
		gSDK->GetCurrToolInteractiveDraw( & d );

		double sx, sy, rx, ry;
		std::string kant, truss;
		size_t n = this->GetToolPointsCount();
		if ( n == 0 )
		{
			TrussSnap s = SnapOpTruss( Meter( muis.x ), Meter( muis.y ) );
			if ( ! s.ok )
			{
				if ( d ) d->ClearObjects();
				Hulp( "Er is nog geen truss-lijn. Teken eerst de truss-lijn van de kabeltruss (tool Truss-lijn)." );
				return;
			}
			sx = s.x * 1000.0; sy = s.y * 1000.0; rx = s.rx; ry = s.ry; kant = s.kant; truss = s.naam;
			char buf[256];
			std::snprintf( buf, sizeof(buf), "Klik 1: %s, %.1f m vanaf het begin, kabels zakken %s.  Object: %s",
						   s.naam.c_str(), s.langs, s.kant == "L" ? "links" : "rechts", Klasse().empty() ? "(kies in de modusbalk)" : Klasse().c_str() );
			Hulp( buf );
		}
		else
		{
			if ( ! fHeeftSnap ) return;
			sx = fSnapX; sy = fSnapY; rx = fRx; ry = fRy; kant = fKant; truss = fTruss;
			double afstand = std::hypot( muis.x - sx, muis.y - sy ) / 1000.0;
			char buf[256];
			std::snprintf( buf, sizeof(buf), "Klik 2: eindpunt bij %s (%.1f m vanaf de drop in bovenaanzicht).",
						   Klasse().empty() ? "het object" : Klasse().c_str(), afstand );
			Hulp( buf );
		}
		if ( ! d ) return;

		// maat van het voorbeeld: ongeveer 30 cm, met een minimum zodat het bij inzoomen zichtbaar blijft
		double r = 150.0;
		double nx = -ry, ny = rx;
		if ( kant == "R" ) { nx = -nx; ny = -ny; }
		auto Lijn = [&](Sint32 id, double x1, double y1, double x2, double y2) {
			MCObjectHandle h = d->GetObject( kLineNode, id );
			if ( ! h ) return;
			VWLine2DObj l( h );
			l.SetLine( VWPoint2D( x1, y1 ), VWPoint2D( x2, y2 ) );
			d->UpdateObject( kLineNode, id );
		};
		Lijn( 1, sx - r, sy - r, sx + r, sy + r );									// kruisje op het droppunt
		Lijn( 2, sx - r, sy + r, sx + r, sy - r );
		Lijn( 3, sx + nx * r, sy + ny * r, sx + nx * r * 4, sy + ny * r * 4 );		// pijl naar de dropkant
		Lijn( 4, sx + nx * r * 4, sy + ny * r * 4, sx + nx * r * 3 - ny * r, sy + ny * r * 3 + nx * r );
		Lijn( 5, sx + nx * r * 4, sy + ny * r * 4, sx + nx * r * 3 + ny * r, sy + ny * r * 3 - nx * r );
		if ( n >= 1 ) Lijn( 6, sx, sy, muis.x, muis.y );								// naar het eindpunt
		else d->RemoveObject( kLineNode, 6 );
	}
	catch ( ... ) {}
}

void CToolDrop_EventSink::HandleComplete()
{
	try
	{
		Wis();
		if ( this->GetToolPointsCount() < 2 )
			return;
		VWPoint2D a = this->GetToolPt2D( 0 ), b = this->GetToolPt2D( 1 );

		nlohmann::json args;
		args["x"]		= Meter( a.x );
		args["y"]		= Meter( a.y );
		args["x2"]		= Meter( b.x );
		args["y2"]		= Meter( b.y );
		args["klasse"]	= Klasse();
		args["vorm"]	= Vorm();
		if ( fHeeftSnap ) args["kant"] = fKant;

		Log( "Tool drop: " + args.dump() );
		if ( IsBezig() )
			return;
		ZetBezig( true );
		ToolUit( "drop", args );
		ZetBezig( false );
		fHeeftSnap = false;
	}
	catch ( ... )
	{
		Log( "Tool drop: C++-fout" );
		ZetBezig( false );
	}
}
