#pragma once

// Eigen Kabeltool-objecten (plug-in objecten met eigen Object Info).
// Opzet volgens het officiële voorbeeld (VectorworksDeveloper/SDKExamples, Examples2026/ObjectExample, ExtObj).
//
//   KT Dim City   – puntobject: vak met naam (2D), kast (3D)
//   KT Drop       – puntobject op de truss: dropsymbool (2D), drop naar beneden (3D)
//   KT Kabelroute – 2D-padobject: vloerroute of truss-lijn, met hoogte
//   KT Kabellabel – puntobject: kabelsymbolen (SOCA 25 m M301 …), vlaggetje, koppelpunt, lengtehulp
//   KT Kabel      – 3D-padobject: één kabelstuk als buis in 3D (en dunne lijn in 2D)

#define KT_DIMCITY		"KT_DimCity"
#define KT_DROP			"KT_Drop"
#define KT_ROUTE		"KT_Kabelroute"
#define KT_LABEL		"KT_Kabellabel"
#define KT_KABEL		"KT_Kabel"

namespace Kabeltool
{
	using namespace VectorWorks::Extension;
	using namespace VWFC::PluginSupport;

	// Rijen van een kabellabel: "kort|lengte|kleur|nummer|rand|vet;..." (kleuren zonder #, vet = 1/0)
	struct LabelRij
	{
		std::string kort, lengte, kleur, nummer, rand, vet;
	};
	std::vector<LabelRij>	LeesRijen(const std::string& tekst);

	// ------------------------------------------------------------------------------------------------------
	class CDimCity_EventSink : public VWParametric_EventSink
	{
	public:
						CDimCity_EventSink(IVWUnknown* parent);
		virtual			~CDimCity_EventSink();
		virtual EObjectEvent	Recalculate() override;
	};

	class CDrop_EventSink : public VWParametric_EventSink
	{
	public:
						CDrop_EventSink(IVWUnknown* parent);
		virtual			~CDrop_EventSink();
		virtual EObjectEvent	Recalculate() override;
	};

	class CRoute_EventSink : public VWParametric_EventSink
	{
	public:
						CRoute_EventSink(IVWUnknown* parent);
		virtual			~CRoute_EventSink();
		virtual EObjectEvent	Recalculate() override;
	};

	class CLabel_EventSink : public VWParametric_EventSink
	{
	public:
						CLabel_EventSink(IVWUnknown* parent);
		virtual			~CLabel_EventSink();
		virtual EObjectEvent	Recalculate() override;
		virtual EObjectEvent	OnInitXProperties(CodeRefID objectID) override;
	};

	class CKabel_EventSink : public VWParametric_EventSink
	{
	public:
						CKabel_EventSink(IVWUnknown* parent);
		virtual			~CKabel_EventSink();
		virtual EObjectEvent	Recalculate() override;
	};

	// ------------------------------------------------------------------------------------------------------
	class CExtDimCity : public VWExtensionParametric
	{
		DEFINE_VWParametricExtension;
	public:
		CExtDimCity(CallBackPtr cbp);
		virtual ~CExtDimCity();
	};

	class CExtDrop : public VWExtensionParametric
	{
		DEFINE_VWParametricExtension;
	public:
		CExtDrop(CallBackPtr cbp);
		virtual ~CExtDrop();
	};

	class CExtRoute : public VWExtensionParametric
	{
		DEFINE_VWParametricExtension;
	public:
		CExtRoute(CallBackPtr cbp);
		virtual ~CExtRoute();
	};

	class CExtLabel : public VWExtensionParametric
	{
		DEFINE_VWParametricExtension;
	public:
		CExtLabel(CallBackPtr cbp);
		virtual ~CExtLabel();
	};

	class CExtKabel : public VWExtensionParametric
	{
		DEFINE_VWParametricExtension;
	public:
		CExtKabel(CallBackPtr cbp);
		virtual ~CExtKabel();
	};
}
