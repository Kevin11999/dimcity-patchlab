#pragma once

// Gereedschapset Kabeltool: vier tools die de klikken zelf opvangen en daarna kabeltool_brug.tool() aanroepen.
// Opzet volgens het officiële voorbeeld (VectorworksDeveloper/SDKExamples, Examples2026/ObjectExample, ExtTool).

namespace Kabeltool
{
	using namespace VectorWorks::Extension;
	using namespace VWFC::PluginSupport;

	// ------------------------------------------------------------------------------------------------------
	// Eén klik: punt doorgeven aan Python (dim city, drop).
	class CToolKlik_EventSink : public VWTool_EventSink
	{
	public:
							CToolKlik_EventSink(IVWUnknown* parent, const char* functie);
		virtual				~CToolKlik_EventSink();

	public:
		virtual void		HandleComplete() override;

	private:
		std::string			fFunctie;
	};

	class CToolDimcity_EventSink : public CToolKlik_EventSink
	{
	public:
		CToolDimcity_EventSink(IVWUnknown* parent) : CToolKlik_EventSink( parent, "dimcity" ) {}
	};

	class CToolDrop_EventSink : public CToolKlik_EventSink
	{
	public:
		CToolDrop_EventSink(IVWUnknown* parent) : CToolKlik_EventSink( parent, "drop" ) {}
	};

	// ------------------------------------------------------------------------------------------------------
	// Meerdere klikken (dubbelklik = klaar): vloerroute, truss-lijn. De truss-tool heeft Naam en Hoogte in de modusbalk.
	class CToolLijn_EventSink : public VWTool_EventSink
	{
	public:
							CToolLijn_EventSink(IVWUnknown* parent, const char* functie, bool metModusbalk);
		virtual				~CToolLijn_EventSink();

	public:
		virtual bool		DoSetUp(bool bRestore, const IToolModeBarInitProvider* pModeBarInitProvider) override;
		virtual TToolStatus	GetStatus(const IToolStatusProvider* pStatusProvider) override;
		virtual void		Draw(IToolDrawProvider* pDrawProvider) override;
		virtual void		HandleComplete() override;

	private:
		std::string			fFunctie;
		bool				fMetModusbalk;
	};

	class CToolVloer_EventSink : public CToolLijn_EventSink
	{
	public:
		CToolVloer_EventSink(IVWUnknown* parent) : CToolLijn_EventSink( parent, "vloer", false ) {}
	};

	class CToolTruss_EventSink : public CToolLijn_EventSink
	{
	public:
		CToolTruss_EventSink(IVWUnknown* parent) : CToolLijn_EventSink( parent, "truss", true ) {}
	};

	// ------------------------------------------------------------------------------------------------------
	class CExtToolDimcity : public VWExtensionTool
	{
		DEFINE_VWToolExtension;
	public:
		CExtToolDimcity(CallBackPtr cbp);
		virtual ~CExtToolDimcity();
	};

	class CExtToolDrop : public VWExtensionTool
	{
		DEFINE_VWToolExtension;
	public:
		CExtToolDrop(CallBackPtr cbp);
		virtual ~CExtToolDrop();
	};

	class CExtToolVloer : public VWExtensionTool
	{
		DEFINE_VWToolExtension;
	public:
		CExtToolVloer(CallBackPtr cbp);
		virtual ~CExtToolVloer();
	};

	class CExtToolTruss : public VWExtensionTool
	{
		DEFINE_VWToolExtension;
	public:
		CExtToolTruss(CallBackPtr cbp);
		virtual ~CExtToolTruss();
	};
}
