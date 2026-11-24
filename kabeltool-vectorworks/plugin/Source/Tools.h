#pragma once

// Gereedschapset Kabeltool: vier tools die de klikken zelf opvangen en daarna Kabeltool::ToolUit() aanroepen.
// Opzet volgens het officiële voorbeeld (VectorworksDeveloper/SDKExamples, Examples2026/ObjectExample, ExtTool).

namespace Kabeltool
{
	using namespace VectorWorks::Extension;
	using namespace VWFC::PluginSupport;

	// ------------------------------------------------------------------------------------------------------
	// Eén klik: punt doorgeven aan de Kabeltool (dim city, drop).
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

	// ------------------------------------------------------------------------------------------------------
	// Drop in twee klikken. Klik 1 snapt op de truss-lijn van de kabeltruss (zoals een lamp op een truss);
	// de kant van de muis bepaalt aan welke kant de kabels zakken. Klik 2 = eindpunt bij het object.
	// Modusbalk: Object (class, zoekbaar) en Dropvorm. Tijdens het bewegen een voorbeeld en een hulptekst.
	class CToolDrop_EventSink : public VWTool_EventSink
	{
	public:
							CToolDrop_EventSink(IVWUnknown* parent);
		virtual				~CToolDrop_EventSink();

	public:
		virtual bool		DoSetUp(bool bRestore, const IToolModeBarInitProvider* pModeBarInitProvider) override;
		virtual void		DoSetDown(bool bRestore, const IToolModeBarInitProvider* pModeBarInitProvider) override;
		virtual TToolStatus	GetStatus(const IToolStatusProvider* pStatusProvider) override;
		virtual void		PointAdded() override;
		virtual void		PointRemoved(bool bClearAllPts) override;
		virtual void		MouseMove() override;
		virtual void		HandleComplete() override;

	private:
		void				Voorbeeld();
		void				Wis();
		void				Hulp(const std::string& tekst);
		std::string			Klasse();
		std::string			Vorm();

		bool				fHeeftSnap = false;
		double				fSnapX = 0, fSnapY = 0, fRx = 1, fRy = 0;	// mm / richting
		std::string			fKant, fTruss;
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
