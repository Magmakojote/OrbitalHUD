/**
 * Statische Inhalte: historische Ereignisse und Fakten.
 * Schlüssel: "Monat-Tag" (Monat 1-basiert).
 */
const PERMANENT_CREW_SINCE = new Date(Date.UTC(2000, 10, 2)); // 2. Nov. 2000, Expedition 1

export function yearsOfCrew(now = new Date()) {
    let y = now.getUTCFullYear() - PERMANENT_CREW_SINCE.getUTCFullYear();
    const anniversary = new Date(Date.UTC(now.getUTCFullYear(), 10, 2));
    if (now < anniversary) y--;
    return y;
}

export const HISTORY = {
    '1-1': 'Neujahr im Orbit – die Crew erlebt rund 16 Sonnenaufgänge pro Tag.',
    '1-25': '1984: US-Präsident Reagan kündigt den Bau einer Raumstation an.',
    '1-29': '1998: Das zwischenstaatliche ISS-Rahmenabkommen wird unterzeichnet.',
    '2-1': '2003: Gedenken an die Crew der Columbia (STS-107).',
    '2-7': '2008: Start des europäischen Labors Columbus mit STS-122.',
    '2-11': '2001: Das US-Labor Destiny wird an der ISS installiert.',
    '3-9': '2008: Erster Start des europäischen Frachters ATV „Jules Verne“.',
    '4-12': '1961: Juri Gagarin umrundet als erster Mensch die Erde.',
    '5-25': '2012: Dragon dockt als erstes kommerzielles Raumschiff an der ISS an.',
    '5-30': '2020: Crew Dragon Demo-2 startet – erster kommerzieller Crew-Flug zur ISS.',
    '6-8': '2018: Alexander Gerst startet zu seiner zweiten ISS-Mission „Horizons“.',
    '7-12': '2000: Das russische Servicemodul Swesda startet.',
    '7-20': '1969: Apollo 11 landet auf dem Mond.',
    '7-21': '2011: Mit STS-135 endet das Space-Shuttle-Programm.',
    '9-6': '2014: Alexander Gerst twittert die berühmten Fotos aus der Cupola.',
    '10-3': '2018: Alexander Gerst übernimmt als erster Deutscher das ISS-Kommando.',
    '10-4': '1957: Sputnik 1 – der erste künstliche Erdsatellit.',
    '10-31': '2000: Expedition 1 startet zur ISS.',
    '11-2': '2000: Ankunft von Expedition 1 – seitdem ist die ISS dauerhaft bewohnt.',
    '11-20': '1998: Start von Sarja, dem ersten ISS-Modul.',
    '12-4': '1998: Start von Unity (STS-88), dem ersten US-Modul.',
    '12-6': '1998: Sarja und Unity werden im Orbit verbunden.'
};

export function todayText(now = new Date()) {
    const key = `${now.getMonth() + 1}-${now.getDate()}`;
    if (HISTORY[key]) return { label: 'Heute in der Geschichte', text: HISTORY[key] };
    return { label: 'Heute im Orbit', text: `Seit ${yearsOfCrew(now)} Jahren ununterbrochen bewohnt – Forschung rund um die Uhr in 400 km Höhe.` };
}

export function facts(now = new Date()) {
    return [
        'Die ISS umrundet die Erde mit rund 7,66 km/s – etwa 27.600 km/h.',
        `Seit ${yearsOfCrew(now)} Jahren ist die Station ohne Unterbrechung bewohnt.`,
        'Über 290 Menschen aus über 20 Ländern haben die ISS bereits besucht.',
        'Die Station ist etwa so groß wie ein Fußballfeld und wiegt rund 420 Tonnen.',
        'Die Bahn ist um 51,6° gegen den Äquator geneigt – so überfliegt die ISS rund 90 % der bewohnten Erde.',
        'Wegen der Erdrotation verschiebt sich die Bodenspur mit jedem Umlauf um gut 22° nach Westen.',
        'Durch den Luftwiderstand sinkt die ISS ständig ab und muss regelmäßig angehoben werden („Reboost“).',
        'Mehr als 3.000 wissenschaftliche Experimente wurden an Bord bereits durchgeführt.',
        'Die Solarflügel haben eine Spannweite von rund 109 Metern.',
        'Bei guten Bedingungen ist die ISS nach Sonne und Mond das hellste Objekt am Himmel.'
    ];
}
