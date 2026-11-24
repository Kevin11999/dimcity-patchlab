#pragma once

// Kabeltool – alles wat in de tekening gebeurt, in C++ (vervangt kabeltool.py; geen Python meer in de plug-in).
// Coördinaten: Vectorworks rekent intern in millimeters; naar de palette gaat alles in meters.

#include <string>
#include <utility>
#include <vector>

namespace Kabeltool
{
	// Aangeroepen door de palette (vwAPI.kt). Geeft altijd {"ok", "data", "meldingen", "fout"}.
	//   laad, bewaar, selectie, selecteer, vloer, truss, lampen, bijwerken, stempelen, demo, opruimen, diagnose
	nlohmann::json	Voer(const std::string& functie, const nlohmann::json& args);

	// Aangeroepen door de tools (punten in meters). Meldingen verschijnen als venster.
	//   dimcity {x,y}, drop {x,y,x2,y2,klasse,vorm,kant}, vloer {punten}, truss {punten, naam, hoogte}
	void			ToolUit(const std::string& functie, const nlohmann::json& args);

	// ---- voor de drop-tool (meters)
	struct TrussSnap
	{
		bool		ok = false;
		std::string	naam, kant;			// kant: "L" of "R" van de looprichting van de truss-lijn
		double		x = 0, y = 0, z = 0;	// gesnapt punt op de truss-lijn
		double		rx = 1, ry = 0;			// richting van de truss-lijn daar
		double		afstand = 0;			// afstand van de muis tot de lijn
		double		langs = 0;				// afstand vanaf het begin van de truss-lijn
	};

	void			ToolVoorbereiden();										// truss-lijnen opnieuw inlezen
	TrussSnap		SnapOpTruss(double x, double y);
	// classes van objecten met blokken (eerst) en lampen: {class, omschrijving}
	std::vector<std::pair<std::string, std::string>>	DoelKlassen();
}
