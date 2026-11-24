#include "StdAfx.h"

#include <cstdlib>
#include <ctime>
#include <fstream>
#include <sstream>
#include <string>

#include "Kabeltool.h"
#include "Tekening.h"

using namespace Kabeltool;

// Map op schijf waar de pagina bij het openen naartoe gekopieerd is (UTF-8, met /).
static std::string gHtmlFolder;

// True zolang de Kabeltool de tekening aanpast. Dan sturen we geen JavaScript naar de palette
// en starten we geen tweede actie tegelijk.
static bool gBezig = false;

bool Kabeltool::IsBezig()				{ return gBezig; }
void Kabeltool::ZetBezig(bool bezig)	{ gBezig = bezig; }

// Logboek voor het zoeken naar crashes: %TEMP%\kabeltool_log.txt
// Elke regel wordt meteen weggeschreven, zodat hij er na een crash nog staat.
void Kabeltool::Log(const std::string& msg)
{
	try
	{
		std::wstring dir = L"C:\\Temp";
		wchar_t* temp = nullptr;
		size_t len = 0;
		if ( _wdupenv_s( &temp, &len, L"TEMP" ) == 0 && temp )
		{
			dir = temp;
			free( temp );
		}

		char tijd[32] = "";
		std::time_t t = std::time( nullptr );
		std::tm lt = {};
		if ( localtime_s( &lt, &t ) == 0 )
			std::strftime( tijd, sizeof(tijd), "%Y-%m-%d %H:%M:%S", &lt );

		std::ofstream f( dir + L"\\kabeltool_log.txt", std::ios::binary | std::ios::app );
		f << tijd << "  " << msg << "\r\n";
		f.flush();
	}
	catch ( ... )
	{
	}
}

// --------------------------------------------------------------------------------------------------------
// Pakt de map html/ uit de resources (.vwr) uit naar schijf (de pagina).
// Zet gHtmlFolder en geeft het volledige pad van index.html. Zelfde werkwijze als het officiële voorbeeld.
static TXString PakHtmlUit()
{
	const TXString	htmlFolderName	= "html";
	const TXString	htmlFile		= "index.html";

	TXString	fileFullPath;

	TXString resRoot = TXString(DefaultPluginVWRIdentifier()) + "/" + htmlFolderName + "/";
	VectorWorks::Filing::IFolderIdentifierPtr	rootFolder( VectorWorks::Filing::IID_FolderIdentifier );
	rootFolder->Set( kExternalDataFolder, true, resRoot );
	rootFolder->CreateOnDisk();

	VectorWorks::Filing::IFolderIdentifierPtr	outputFolderID;
	VectorWorks::Filing::IFileIdentifierPtr		outputFileID( VectorWorks::Filing::IID_FileIdentifier );
	VectorWorks::Filing::IRawOSFilePtr			outputRawFile( VectorWorks::Filing::IID_RawOSFile );

	gSDK->EnumerateVWResources( resRoot, true, [&](const TXString& resourceIdentifier) {
		TXResource	res( resourceIdentifier );

		TXString fileName = resourceIdentifier.Mid( resRoot.GetLength() );
		outputFileID->Set( rootFolder, fileName );

		outputFileID->GetFolder( & outputFolderID );
		outputFolderID->CreateOnDisk();

		outputRawFile->Open( outputFileID, false, true, false, true );
		outputRawFile->Write( 0, res.Size(), res.Buffer() );
		outputRawFile->Close();

		if ( fileName.Right(htmlFile.GetLength()) == htmlFile )
			outputFileID->GetFileFullPath( fileFullPath );
	});

	// map van index.html onthouden (voor het logboek)
	std::string full = fileFullPath.GetStdString();
	for ( char& c : full )
		if ( c == '\\' ) c = '/';
	size_t slash = full.find_last_of( '/' );
	gHtmlFolder = ( slash == std::string::npos ) ? std::string() : full.substr( 0, slash );

	Log( "Bestanden uitgepakt naar: " + gHtmlFolder );
	return fileFullPath;
}

// --------------------------------------------------------------------------------------------------------
BEGIN_WebPalette_DISPATCH_MAP(CPaletteJSProvider)
ADD_WebPalette_FUNCTION( "kt", OnKt )
ADD_WebPalette_FUNCTION( "tool", OnTool )
END_WebPalette_DISPATCH_MAP2

CPaletteJSProvider::CPaletteJSProvider( IVWUnknown* parent )
	: VWExtensionPaletteJSProvider( parent )
{
}

CPaletteJSProvider::~CPaletteJSProvider()
{
}

void CPaletteJSProvider::OnInit(IInitContext* context)
{
	Log( "OnInit (JavaScript-brug wordt klaargezet)" );

	fWebFrame = context->GetWebFrame();

	context->AddReourceAccessFunction( "vwAPI", DefaultPluginVWRIdentifier() );

	// *Sync: wordt op de hoofdthread uitgevoerd, zodat de SDK aangeroepen mag worden
	context->AddFunctionPromiseSync( "vwAPI.kt" );
	context->AddFunctionPromiseSync( "vwAPI.tool" );

	Log( "OnInit klaar" );
}

// vwAPI.kt( "functie", { ...argumenten } )  ->  Promise met { ok, data, meldingen, fout }
// Alles gebeurt in C++ (Tekening.cpp); er wordt geen Python meer gestart.
void CPaletteJSProvider::OnKt(const TXString& objName, const TXString& functionName, const std::vector<nlohmann::json>& args, VectorWorks::UI::IJSFunctionCallbackContext* context)
{
	if ( gBezig )
	{
		Log( "OnKt geweigerd: nog bezig" );
		context->Reject( "Kabeltool: Vectorworks is nog bezig." );
		return;
	}

	std::string fn = ( args.size() > 0 && args[0].is_string() ) ? args[0].get<std::string>() : std::string();
	nlohmann::json arguments = args.size() > 1 ? args[1] : nlohmann::json::object();

	nlohmann::json antwoord;
	gBezig = true;
	try
	{
		Log( "Palette: " + fn );
		antwoord = Voer( fn, arguments );
	}
	catch ( ... )
	{
		antwoord = { { "ok", false }, { "fout", "Onbekende interne fout." }, { "meldingen", nlohmann::json::array() } };
	}
	gBezig = false;

	Log( "Palette: " + fn + " klaar" );
	context->Resolve( antwoord );
}

// vwAPI.tool( "dimcity" | "drop" | "vloer" | "truss" )  ->  kiest die tool in Vectorworks
void CPaletteJSProvider::OnTool(const TXString& objName, const TXString& functionName, const std::vector<nlohmann::json>& args, VectorWorks::UI::IJSFunctionCallbackContext* context)
{
	try
	{
		std::string naam = ( args.size() > 0 && args[0].is_string() ) ? args[0].get<std::string>() : std::string();
		const char* univ = nullptr;
		if ( naam == "dimcity" )	univ = "KabeltoolDimcity";
		else if ( naam == "drop" )	univ = "KabeltoolDrop";
		else if ( naam == "vloer" )	univ = "KabeltoolVloer";
		else if ( naam == "truss" )	univ = "KabeltoolTruss";

		if ( ! univ )
		{
			context->Reject( "Kabeltool: onbekende tool." );
			return;
		}

		Log( std::string( "Palette kiest tool " ) + univ );
		bool ok = gSDK->SetToolByName( univ ) ? true : false;
		context->Resolve( nlohmann::json( ok ) );
	}
	catch ( ... )
	{
		Log( "OnTool C++-fout" );
		context->Reject( "Kabeltool: tool kiezen mislukt." );
	}
}

// --------------------------------------------------------------------------------------------------------
CUpdateSupport::CUpdateSupport(CallBackPtr)
{
}

CUpdateSupport::~CUpdateSupport()
{
}

void CUpdateSupport::Init(IObjUpdateSupportContext* context)
{
	context->AcceptNotification( kNotifyDocChange );
	context->AcceptNotification( kNotifySelChange );
}

void CUpdateSupport::OnNotification(IObjUpdateSupportContext* context)
{
	StatusID	whichChange;
	StatusData	additionalData;
	context->GetNotification( whichChange, additionalData );
	if ( whichChange == kNotifyDocChange || whichChange == kNotifySelChange )
	{
		// Niet terugroepen naar de pagina terwijl de Kabeltool zelf de tekening aanpast.
		if ( gBezig )
			return;

		IWebPaletteFrame* webFrame = context->GetWebPaletteFrame( CExtKabeltoolPalette::_GetIID() );
		if ( webFrame )
			webFrame->ExecuteJavaScript( "if (window.KT && window.KT.vw) { window.KT.vw.gewijzigd(); }" );
	}
}

// --------------------------------------------------------------------------------------------------------
CExtKabeltoolPalette::CExtKabeltoolPalette(CallBackPtr)
{
}

CExtKabeltoolPalette::~CExtKabeltoolPalette()
{
}

void CExtKabeltoolPalette::DefineSinks()
{
	this->DefineSink<CPaletteJSProvider>( IID_WebJavaScriptProvider );
}

TXString CExtKabeltoolPalette::GetTitle()
{
	return TXResStr("ExtKabeltoolPalette", "paletteName");
}

bool CExtKabeltoolPalette::GetInitialSize(ViewCoord& outCX, ViewCoord& outCY)
{
	outCX = 900;
	outCY = 700;
	return true;
}

bool CExtKabeltoolPalette::GetMinimalSize(ViewCoord& outCX, ViewCoord& outCY)
{
	outCX = 480;
	outCY = 400;
	return true;
}

// URL van index.html, nadat de map html/ uit de resources is uitgepakt (zie PakHtmlUit).
TXString CExtKabeltoolPalette::GetInitialURL()
{
	Log( "GetInitialURL start" );

	TXString fileFullPath;
	try
	{
		fileFullPath = PakHtmlUit();
	}
	catch ( ... )
	{
		Log( "GetInitialURL: uitpakken mislukt" );
	}

	Log( "GetInitialURL klaar: " + fileFullPath.GetStdString() );

	return TXString("file://") + fileFullPath;
}

// --------------------------------------------------------------------------------------------------------
// {8275FCAA-F544-429D-9763-86912571E781}
IMPLEMENT_VWPaletteExtension(
	/*Extension class*/	CExtKabeltoolPalette,
	/*Universal name*/	"KabeltoolPalette",
	/*Version*/			1,
	/*UUID*/			0x8275fcaa, 0xf544, 0x429d, 0x97, 0x63, 0x86, 0x91, 0x25, 0x71, 0xe7, 0x81 );

// --------------------------------------------------------------------------------------------------------
static SMenuDef		gMenuDef = {
	/*Needs*/				EMenuEnableFlags::DocIsActive,
	/*NeedsNot*/			EMenuEnableFlags::None,
	/*Title*/				{"ExtMenuKabeltool", "menu_title"},
	/*Category*/			{"ExtMenuKabeltool", "menu_category"},
	/*HelpText*/			{"ExtMenuKabeltool", "menu_helptext"},
	/*VersionCreated*/		30,
	/*VersoinModified*/		0,
	/*VersoinRetired*/		0,
	/*OverrideHelpID*/		" "
};

// --------------------------------------------------------------------------------------------------------
// {59C2B88E-E0EB-4F26-AEF8-8236DCB1FFAE}
IMPLEMENT_VWMenuExtension(
	/*Extension class*/	CExtMenuKabeltool,
	/*Event sink*/		CExtMenuKabeltool_EventSink,
	/*Universal name*/	"ExtMenuKabeltool",
	/*Version*/			1,
	/*UUID*/			0x59c2b88e, 0xe0eb, 0x4f26, 0xae, 0xf8, 0x82, 0x36, 0xdc, 0xb1, 0xff, 0xae );

CExtMenuKabeltool::CExtMenuKabeltool(CallBackPtr cbp)
	: VWExtensionMenu( cbp, gMenuDef )
{
}

CExtMenuKabeltool::~CExtMenuKabeltool()
{
}

CExtMenuKabeltool_EventSink::CExtMenuKabeltool_EventSink(IVWUnknown* parent)
	: VWMenu_EventSink( parent )
{
}

CExtMenuKabeltool_EventSink::~CExtMenuKabeltool_EventSink()
{
}

void CExtMenuKabeltool_EventSink::DoInterface()
{
	Log( "------ Menu 'Kabeltool tonen' gekozen ------" );
	gSDK->SetWebPaletteVisibility( CExtKabeltoolPalette::_GetIID(), true );
}
