#include "StdAfx.h"

#include "Kabeltool.h"
#include "Tools.h"

using namespace Kabeltool;

// Vectorworks rekent intern in millimeters; Python krijgt meters.
static double Meter(double mm) { return mm / 1000.0; }

// Laatst gebruikte naam en hoogte van de truss-tool (blijven staan tot Vectorworks sluit).
static TXString gTrussNaam		= "LX01";
static TXString gTrussHoogte	= "8";

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
		PythonTool( fFunctie, args );
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
		pModeBarInitProvider->AddEditTextModeGroup( "Hoogte (m)", gTrussHoogte );	// groep 1
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
		PythonTool( fFunctie, args );
	}
	catch ( ... )
	{
		Log( "Tool " + fFunctie + ": C++-fout" );
	}
}
