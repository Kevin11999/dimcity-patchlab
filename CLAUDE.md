# Afspraken met Kevin (voor Claude)

## Hoe we werken
- Antwoord in het Nederlands en eerlijk. Het programma is alleen in de browser/simulator geprobeerd, nooit op echte hardware: zeg dat erbij.
- Kevin beschrijft, jij antwoordt eerst; pas na zijn akkoord bouw je. Bij een lange lijst: eerst lezen en vragen stellen, nog niets bouwen.
- Zuinig met tokens: niets testen, geen Playwright of regressietests, het programma niet draaien en geen screenshots maken, tenzij Kevin het vraagt. Veel tokens alleen als hij het zegt.
- Alleen de bugs oplossen en de dingen doen die Kevin zegt. Niets extra's.
- Code aanpassen mag pas na 2× toestemming: eerst zijn "ja" op het plan, daarna een aparte vraag "Mag ik nu beginnen?" en zijn "ja". Een release vraag ik apart, tenzij hij het expliciet zegt.
- Vragen aan Kevin stel ik altijd in een pop-up (AskUserQuestion), zodat hij ze netjes kan beantwoorden.
- De handleiding (core/manual.js, docs/, rondleidingen, vertalingen) met rust laten, tenzij hij erom vraagt.
- Video's niet opnieuw opnemen, tenzij hij erom vraagt.

## Release
- Versie blijft onder 1.0.0. Een release is: versie in package.json ophogen, één korte EN + NL regel in CHANGES (core/manual.js; de bouw faalt zonder), `npm run manual`, pushen naar main. De GitHub-workflow bouwt dan zelf.
- Commitberichten eindigen met de attributieregels die de sessie opgeeft.
- Geen pull request tenzij hij erom vraagt. Alleen de repo kevin11999/dimcity-patchlab gebruiken.
- Nooit processen killen die je via ps | grep vindt.
