#pragma once

// Kabeltool web palette voor Vectorworks 2026.
// Opzet overgenomen van het officiële voorbeeld (VectorworksDeveloper/SDKExamples, Examples2026/WebPaletteExample).

namespace Kabeltool
{
	using namespace VectorWorks::Extension;
	using namespace VWFC::PluginSupport;

	// Logboek: %TEMP%\kabeltool_log.txt
	void	Log(const std::string& msg);

	// True zolang de Kabeltool de tekening aanpast (dan geen meldingen naar de palette).
	bool	IsBezig();
	void	ZetBezig(bool bezig);

	// --------------------------------------------------------------------------------------------------------
	// De brug tussen de pagina (JavaScript) en Vectorworks.
	// De pagina roept vwAPI.kt(functie, argumenten) aan; dat wordt in C++ uitgevoerd (Tekening.cpp).
	class CPaletteJSProvider : public VWExtensionPaletteJSProvider
	{
	public:
		CPaletteJSProvider(IVWUnknown* parent);
		virtual ~CPaletteJSProvider();

		virtual void OnInit(IInitContext* context);

		DEFINE_WebPalette_DISPATCH_MAP;

	private:
		void	OnKt(const TXString& objName, const TXString& functionName, const std::vector<nlohmann::json>& args, VectorWorks::UI::IJSFunctionCallbackContext* context);
		void	OnTool(const TXString& objName, const TXString& functionName, const std::vector<nlohmann::json>& args, VectorWorks::UI::IJSFunctionCallbackContext* context);
	};

	// --------------------------------------------------------------------------------------------------------
	// {E7BD09BF-EDF8-4616-A28E-D99037D02CC4}
	static const VWIID IID_UpdateSupport = { 0xe7bd09bf, 0xedf8, 0x4616, { 0xa2, 0x8e, 0xd9, 0x90, 0x37, 0xd0, 0x2c, 0xc4 } };

	// Meldt aan de pagina dat de selectie of het document is veranderd.
	class CUpdateSupport : public VCOMImmediateImpl<IObjUpdateSupport>
	{
	public:
				CUpdateSupport(CallBackPtr);
		virtual ~CUpdateSupport();

	public:
		virtual void VCOM_CALLTYPE	Init(IObjUpdateSupportContext* context);
		virtual void VCOM_CALLTYPE	OnNotification(IObjUpdateSupportContext* context);
	};

	// --------------------------------------------------------------------------------------------------------
	class CExtKabeltoolPalette : public VWExtensionWebPalette
	{
		DEFINE_VWPaletteExtension;
	public:
		CExtKabeltoolPalette(CallBackPtr);
		virtual ~CExtKabeltoolPalette();

		virtual void		DefineSinks() override;

		virtual TXString	GetTitle() override;
		virtual bool		GetInitialSize(ViewCoord& outCX, ViewCoord& outCY) override;
		virtual bool		GetMinimalSize(ViewCoord& outCX, ViewCoord& outCY) override;
		virtual TXString	VCOM_CALLTYPE	GetInitialURL() override;
	};

	// ------------------------------------------------------------------------------------------------------
	// Menucommando dat de palette toont (sinds 2025 staan web palettes niet meer vanzelf in het Window-menu).
	class CExtMenuKabeltool_EventSink : public VWMenu_EventSink
	{
	public:
							CExtMenuKabeltool_EventSink(IVWUnknown* parent);
		virtual				~CExtMenuKabeltool_EventSink();

	public:
		virtual void		DoInterface();
	};

	class CExtMenuKabeltool : public VWExtensionMenu
	{
		DEFINE_VWMenuExtension;
	public:
										CExtMenuKabeltool(CallBackPtr cbp);
		virtual							~CExtMenuKabeltool();
	};
}
