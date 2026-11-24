//
//	Ingang van de Kabeltool-plug-in voor Vectorworks.
//

#include "StdAfx.h"

#include "Kabeltool.h"
#include "Tools.h"
#include "Objecten.h"

const char * DefaultPluginVWRIdentifier() { return "KabeltoolPalette"; }

//------------------------------------------------------------------
// SDK-versie waarvoor deze plug-in is gebouwd
extern "C" Sint32 GS_EXTERNAL_ENTRY plugin_module_ver() { return SDK_VERSION; }

//------------------------------------------------------------------
extern "C" Sint32 GS_EXTERNAL_ENTRY plugin_module_main(Sint32 action, void* moduleInfo, const VWIID& iid, IVWUnknown*& inOutInterface, CallBackPtr cbp)
{
	::GS_InitializeVCOM( cbp );

	Sint32	reply	= 0L;

	using namespace VWFC::PluginSupport;

	REGISTER_Extension<Kabeltool::CExtKabeltoolPalette>( GROUPID_ExtensionWebPalettes, action, moduleInfo, iid, inOutInterface, cbp, reply );
	REGISTER_Extension<Kabeltool::CExtMenuKabeltool>( GROUPID_ExtensionMenu, action, moduleInfo, iid, inOutInterface, cbp, reply );
	REGISTER_Extension<Kabeltool::CExtToolDimcity>( GROUPID_ExtensionTool, action, moduleInfo, iid, inOutInterface, cbp, reply );
	REGISTER_Extension<Kabeltool::CExtToolDrop>( GROUPID_ExtensionTool, action, moduleInfo, iid, inOutInterface, cbp, reply );
	REGISTER_Extension<Kabeltool::CExtToolVloer>( GROUPID_ExtensionTool, action, moduleInfo, iid, inOutInterface, cbp, reply );
	REGISTER_Extension<Kabeltool::CExtToolTruss>( GROUPID_ExtensionTool, action, moduleInfo, iid, inOutInterface, cbp, reply );
	REGISTER_Extension<Kabeltool::CExtDimCity>( GROUPID_ExtensionParametric, action, moduleInfo, iid, inOutInterface, cbp, reply );
	REGISTER_Extension<Kabeltool::CExtDrop>( GROUPID_ExtensionParametric, action, moduleInfo, iid, inOutInterface, cbp, reply );
	REGISTER_Extension<Kabeltool::CExtRoute>( GROUPID_ExtensionParametric, action, moduleInfo, iid, inOutInterface, cbp, reply );
	REGISTER_Extension<Kabeltool::CExtLabel>( GROUPID_ExtensionParametric, action, moduleInfo, iid, inOutInterface, cbp, reply );
	REGISTER_Extension<Kabeltool::CExtKabel>( GROUPID_ExtensionParametric, action, moduleInfo, iid, inOutInterface, cbp, reply );
	REGISTER_Interface<Kabeltool::CUpdateSupport>( GROUPID_ObjUpdateSupport, Kabeltool::IID_UpdateSupport, action, moduleInfo, iid, inOutInterface, cbp, reply );

	return reply;
}
