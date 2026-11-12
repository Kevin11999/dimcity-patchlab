#include "StdAfx.h"

#include <fstream>
#include <sstream>
#include <string>

#include "Interfaces/VectorWorks/Scripting/IPythonScriptEngine.h"
#include "Kabeltool.h"

using namespace Kabeltool;

// Map op schijf waar de pagina en de Python-bestanden bij het starten naartoe gekopieerd zijn (UTF-8, met /).
static std::string gHtmlFolder;

static std::wstring Wide(const std::string& utf8)
{
	return TXString( utf8 ).GetStdWString();
}

// --------------------------------------------------------------------------------------------------------
BEGIN_WebPalette_DISPATCH_MAP(CPaletteJSProvider)
ADD_WebPalette_FUNCTION( "py", OnPy )
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
	fWebFrame = context->GetWebFrame();

	context->AddReourceAccessFunction( "vwAPI", DefaultPluginVWRIdentifier() );

	// *Sync: wordt op de hoofdthread uitgevoerd, zodat Vectorworks aangeroepen mag worden
	context->AddFunctionPromiseSync( "vwAPI.py" );
}

// vwAPI.py( "functienaam", { ...argumenten } )  ->  Promise met het antwoord van kabeltool_brug.roep()
void CPaletteJSProvider::OnPy(const TXString& objName, const TXString& functionName, const std::vector<nlohmann::json>& args, VectorWorks::UI::IJSFunctionCallbackContext* context)
{
	std::string fn = ( args.size() > 0 && args[0].is_string() ) ? args[0].get<std::string>() : std::string();
	for ( char c : fn )
	{
		bool ok = ( c >= 'a' && c <= 'z' ) || ( c >= 'A' && c <= 'Z' ) || ( c >= '0' && c <= '9' ) || c == '_';
		if ( ! ok ) { fn.clear(); break; }
	}

	if ( fn.empty() || gHtmlFolder.empty() )
	{
		context->Reject( "Kabeltool: ongeldige aanroep." );
		return;
	}

	nlohmann::json arguments = args.size() > 1 ? args[1] : nlohmann::json::object();

	const std::string inPath	= gHtmlFolder + "/_kt_in.json";
	const std::string outPath	= gHtmlFolder + "/_kt_uit.json";

	{
		std::ofstream f( Wide( inPath ), std::ios::binary | std::ios::trunc );
		f << arguments.dump();
	}
	::_wremove( Wide( outPath ).c_str() );

	// json::dump() van een tekst geeft een geldige Python-tekst met aanhalingstekens
	std::string script;
	script += "import sys\n";
	script += "_kt_map = " + nlohmann::json( gHtmlFolder ).dump() + "\n";
	script += "if _kt_map not in sys.path:\n\tsys.path.insert(0, _kt_map)\n";
	script += "import kabeltool_brug\n";
	script += "kabeltool_brug.roep(" + nlohmann::json( fn ).dump() + ", " + nlohmann::json( inPath ).dump() + ", " + nlohmann::json( outPath ).dump() + ")\n";

	VectorWorks::Scripting::IPythonScriptEnginePtr engine( VectorWorks::Scripting::IID_PythonScriptEngine );
	if ( ! engine )
	{
		context->Reject( "Kabeltool: Python is niet beschikbaar." );
		return;
	}
	engine->ExecuteScript( TXString( script ) );

	std::ifstream f( Wide( outPath ), std::ios::binary );
	if ( ! f )
	{
		context->Reject( "Kabeltool: geen antwoord van Python." );
		return;
	}
	std::stringstream buffer;
	buffer << f.rdbuf();

	nlohmann::json result = nlohmann::json::parse( buffer.str(), nullptr, false );
	if ( result.is_discarded() )
		context->Reject( "Kabeltool: onleesbaar antwoord van Python." );
	else
		context->Resolve( result );
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

// Kopieert de map html/ uit de resources (.vwr) naar schijf en geeft de URL van index.html.
// Zelfde werkwijze als het officiële voorbeeld; de Python-bestanden staan in dezelfde map.
TXString CExtKabeltoolPalette::GetInitialURL()
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

	// map van index.html onthouden voor de Python-brug
	std::string full = fileFullPath.GetStdString();
	for ( char& c : full )
		if ( c == '\\' ) c = '/';
	size_t slash = full.find_last_of( '/' );
	gHtmlFolder = ( slash == std::string::npos ) ? std::string() : full.substr( 0, slash );

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
	gSDK->SetWebPaletteVisibility( CExtKabeltoolPalette::_GetIID(), true );
}
