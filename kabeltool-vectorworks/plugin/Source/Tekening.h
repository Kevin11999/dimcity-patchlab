#pragma once

// Kabeltool – alles wat in de tekening gebeurt, in C++ (vervangt kabeltool.py; geen Python meer in de plug-in).
// Coördinaten: Vectorworks rekent intern in millimeters; naar de palette gaat alles in meters.

namespace Kabeltool
{
	// Aangeroepen door de palette (vwAPI.kt). Geeft altijd {"ok", "data", "meldingen", "fout"}.
	//   laad, bewaar, selectie, selecteer, vloer, truss, lampen, bijwerken, stempelen, demo
	nlohmann::json	Voer(const std::string& functie, const nlohmann::json& args);

	// Aangeroepen door de tools (punten in meters). Meldingen verschijnen als venster.
	//   dimcity {x,y}, drop {x,y}, vloer {punten}, truss {punten, naam, hoogte}
	void			ToolUit(const std::string& functie, const nlohmann::json& args);
}
