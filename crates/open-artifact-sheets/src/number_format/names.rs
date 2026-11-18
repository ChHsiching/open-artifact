//! Month and day names in the languages a pattern may name (`[$-fr-FR]mmmm`), as they are printed.

/// One language's names, each list joined with `|`: months from January, days from Sunday.
#[derive(Debug, PartialEq)]
pub(crate) struct Names {
    /// `mmm`, `mmmm` and `mmmmm`.
    pub short: &'static str,
    pub long: &'static str,
    pub narrow: &'static str,
    /// `mmm` and `mmmm` in a section that shows the day of the month, when they differ (else empty).
    pub short_with_day: &'static str,
    pub long_with_day: &'static str,
    /// `ddd` and `dddd`.
    pub days_short: &'static str,
    pub days_long: &'static str,
}

/// The names for a language tag (`fr-FR`, in any case), if dates are printed in it.
pub(crate) fn find(tag: &str) -> Option<&'static Names> {
    TAGS.iter().find(|(t, _)| t.eq_ignore_ascii_case(tag)).map(|(_, names)| *names)
}

pub(crate) static AF_ZA: Names = Names {
    short: "Jan.|Feb.|Mrt.|Apr.|Mei|Jun.|Jul.|Aug.|Sep.|Okt.|Nov.|Des.",
    long: "Januarie|Februarie|Maart|April|Mei|Junie|Julie|Augustus|September|Oktober|November|Desember",
    narrow: "J|F|M|A|M|J|J|A|S|O|N|D",
    short_with_day: "",
    long_with_day: "",
    days_short: "So.|Ma.|Di.|Wo.|Do.|Vr.|Sa.",
    days_long: "Sondag|Maandag|Dinsdag|Woensdag|Donderdag|Vrydag|Saterdag",
};
pub(crate) static AM_ET: Names = Names {
    short: "ጃን|ፌብ|ማርች|ኤፕሪ|ሜይ|ጁን|ጁላይ|ኦገስ|ሴፕቴ|ኦክቶ|ኖቬም|ዲሴም",
    long: "ጃንዋሪ|ፌብሩዋሪ|ማርች|ኤፕሪል|ሜይ|ጁን|ጁላይ|ኦገስት|ሴፕቴምበር|ኦክቶበር|ኖቬምበር|ዲሴምበር",
    narrow: "ጃ|ፌ|ማ|ኤ|ሜ|ጁ|ጁ|ኦ|ሴ|ኦ|ኖ|ዲ",
    short_with_day: "",
    long_with_day: "",
    days_short: "እሑድ|ሰኞ|ማክሰ|ረቡዕ|ሐሙስ|ዓርብ|ቅዳሜ",
    days_long: "እሑድ|ሰኞ|ማክሰኞ|ረቡዕ|ሐሙስ|ዓርብ|ቅዳሜ",
};
pub(crate) static AR_AE: Names = Names {
    short: "يناير|فبراير|مارس|أبريل|مايو|يونيو|يوليو|أغسطس|سبتمبر|أكتوبر|نوفمبر|ديسمبر",
    long: "يناير|فبراير|مارس|أبريل|مايو|يونيو|يوليو|أغسطس|سبتمبر|أكتوبر|نوفمبر|ديسمبر",
    narrow: "ي|ف|م|أ|و|ن|ل|غ|س|ك|ب|د",
    short_with_day: "",
    long_with_day: "",
    days_short: "الأحد|الاثنين|الثلاثاء|الأربعاء|الخميس|الجمعة|السبت",
    days_long: "الأحد|الاثنين|الثلاثاء|الأربعاء|الخميس|الجمعة|السبت",
};
pub(crate) static AR_DZ: Names = Names {
    short: "جانفي|فيفري|مارس|أفريل|ماي|جوان|جويلية|أوت|سبتمبر|أكتوبر|نوفمبر|ديسمبر",
    long: "جانفي|فيفري|مارس|أفريل|ماي|جوان|جويلية|أوت|سبتمبر|أكتوبر|نوفمبر|ديسمبر",
    narrow: "ج|ف|م|أ|م|ج|ج|أ|س|أ|ن|د",
    short_with_day: "",
    long_with_day: "",
    days_short: "الأحد|الاثنين|الثلاثاء|الأربعاء|الخميس|الجمعة|السبت",
    days_long: "الأحد|الاثنين|الثلاثاء|الأربعاء|الخميس|الجمعة|السبت",
};
pub(crate) static AR_MA: Names = Names {
    short: "يناير|فبراير|مارس|أبريل|ماي|يونيو|يوليوز|غشت|شتنبر|أكتوبر|نونبر|دجنبر",
    long: "يناير|فبراير|مارس|أبريل|ماي|يونيو|يوليوز|غشت|شتنبر|أكتوبر|نونبر|دجنبر",
    narrow: "ي|ف|م|أ|م|ن|ل|غ|ش|ك|ب|د",
    short_with_day: "",
    long_with_day: "",
    days_short: "الأحد|الاثنين|الثلاثاء|الأربعاء|الخميس|الجمعة|السبت",
    days_long: "الأحد|الاثنين|الثلاثاء|الأربعاء|الخميس|الجمعة|السبت",
};
pub(crate) static AZ_AZ: Names = Names {
    short: "yan|fev|mar|apr|may|iyn|iyl|avq|sen|okt|noy|dek",
    long: "yanvar|fevral|mart|aprel|may|iyun|iyul|avqust|sentyabr|oktyabr|noyabr|dekabr",
    narrow: "1|2|3|4|5|6|7|8|9|10|11|12",
    short_with_day: "",
    long_with_day: "",
    days_short: "B.|B.E.|Ç.A.|Ç.|C.A.|C.|Ş.",
    days_long: "bazar|bazar ertəsi|çərşənbə axşamı|çərşənbə|cümə axşamı|cümə|şənbə",
};
pub(crate) static BE_BY: Names = Names {
    short: "сту|лют|сак|кра|май|чэр|ліп|жні|вер|кас|ліс|сне",
    long: "студзень|люты|сакавік|красавік|май|чэрвень|ліпень|жнівень|верасень|кастрычнік|лістапад|снежань",
    narrow: "с|л|с|к|м|ч|л|ж|в|к|л|с",
    short_with_day: "сту|лют|сак|кра|мая|чэр|ліп|жні|вер|кас|ліс|сне",
    long_with_day: "студзеня|лютага|сакавіка|красавіка|мая|чэрвеня|ліпеня|жніўня|верасня|кастрычніка|лістапада|снежня",
    days_short: "нд|пн|аў|ср|чц|пт|сб",
    days_long: "нядзеля|панядзелак|аўторак|серада|чацвер|пятніца|субота",
};
pub(crate) static BG_BG: Names = Names {
    short: "яну|фев|март|апр|май|юни|юли|авг|сеп|окт|ное|дек",
    long: "януари|февруари|март|април|май|юни|юли|август|септември|октомври|ноември|декември",
    narrow: "01|02|03|04|05|06|07|08|09|10|11|12",
    short_with_day: "",
    long_with_day: "",
    days_short: "нд|пн|вт|ср|чт|пт|сб",
    days_long: "неделя|понеделник|вторник|сряда|четвъртък|петък|събота",
};
pub(crate) static BS_BA: Names = Names {
    short: "jan|feb|mar|apr|maj|jun|jul|aug|sep|okt|nov|dec",
    long: "januar|februar|mart|april|maj|juni|juli|august|septembar|oktobar|novembar|decembar",
    narrow: "j|f|m|a|m|j|j|a|s|o|n|d",
    short_with_day: "",
    long_with_day: "",
    days_short: "ned|pon|uto|sri|čet|pet|sub",
    days_long: "nedjelja|ponedjeljak|utorak|srijeda|četvrtak|petak|subota",
};
pub(crate) static CA_ES: Names = Names {
    short: "gen.|febr.|març|abr.|maig|juny|jul.|ag.|set.|oct.|nov.|des.",
    long: "gener|febrer|març|abril|maig|juny|juliol|agost|setembre|octubre|novembre|desembre",
    narrow: "GN|FB|MÇ|AB|MG|JN|JL|AG|ST|OC|NV|DS",
    short_with_day: "de gen.|de febr.|de març|d’abr.|de maig|de juny|de jul.|d’ag.|de set.|d’oct.|de nov.|de des.",
    long_with_day: "de gener|de febrer|de març|d’abril|de maig|de juny|de juliol|d’agost|de setembre|d’octubre|de novembre|de desembre",
    days_short: "dg.|dl.|dt.|dc.|dj.|dv.|ds.",
    days_long: "diumenge|dilluns|dimarts|dimecres|dijous|divendres|dissabte",
};
pub(crate) static CS_CZ: Names = Names {
    short: "led|úno|bře|dub|kvě|čvn|čvc|srp|zář|říj|lis|pro",
    long: "leden|únor|březen|duben|květen|červen|červenec|srpen|září|říjen|listopad|prosinec",
    narrow: "1|2|3|4|5|6|7|8|9|10|11|12",
    short_with_day: "",
    long_with_day: "ledna|února|března|dubna|května|června|července|srpna|září|října|listopadu|prosince",
    days_short: "ne|po|út|st|čt|pá|so",
    days_long: "neděle|pondělí|úterý|středa|čtvrtek|pátek|sobota",
};
pub(crate) static CY_GB: Names = Names {
    short: "Ion|Chw|Maw|Ebr|Mai|Meh|Gor|Awst|Medi|Hyd|Tach|Rhag",
    long: "Ionawr|Chwefror|Mawrth|Ebrill|Mai|Mehefin|Gorffennaf|Awst|Medi|Hydref|Tachwedd|Rhagfyr",
    narrow: "I|Ch|M|E|M|M|G|A|M|H|T|Rh",
    short_with_day: "Ion|Chwef|Maw|Ebr|Mai|Meh|Gorff|Awst|Medi|Hyd|Tach|Rhag",
    long_with_day: "",
    days_short: "Sul|Llun|Maw|Mer|Iau|Gwe|Sad",
    days_long: "Dydd Sul|Dydd Llun|Dydd Mawrth|Dydd Mercher|Dydd Iau|Dydd Gwener|Dydd Sadwrn",
};
pub(crate) static DA_DK: Names = Names {
    short: "jan.|feb.|mar.|apr.|maj|jun.|jul.|aug.|sep.|okt.|nov.|dec.",
    long: "januar|februar|marts|april|maj|juni|juli|august|september|oktober|november|december",
    narrow: "J|F|M|A|M|J|J|A|S|O|N|D",
    short_with_day: "",
    long_with_day: "",
    days_short: "søn.|man.|tirs.|ons.|tors.|fre.|lør.",
    days_long: "søndag|mandag|tirsdag|onsdag|torsdag|fredag|lørdag",
};
pub(crate) static DE_AT: Names = Names {
    short: "Jän|Feb|Mär|Apr|Mai|Jun|Jul|Aug|Sep|Okt|Nov|Dez",
    long: "Jänner|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember",
    narrow: "J|F|M|A|M|J|J|A|S|O|N|D",
    short_with_day: "Jän.|Feb.|März|Apr.|Mai|Juni|Juli|Aug.|Sep.|Okt.|Nov.|Dez.",
    long_with_day: "",
    days_short: "So|Mo|Di|Mi|Do|Fr|Sa",
    days_long: "Sonntag|Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag",
};
pub(crate) static DE_CH: Names = Names {
    short: "Jan|Feb|Mär|Apr|Mai|Jun|Jul|Aug|Sep|Okt|Nov|Dez",
    long: "Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember",
    narrow: "J|F|M|A|M|J|J|A|S|O|N|D",
    short_with_day: "Jan.|Feb.|März|Apr.|Mai|Juni|Juli|Aug.|Sept.|Okt.|Nov.|Dez.",
    long_with_day: "",
    days_short: "So|Mo|Di|Mi|Do|Fr|Sa",
    days_long: "Sonntag|Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag",
};
pub(crate) static EL_GR: Names = Names {
    short: "Ιαν|Φεβ|Μαρ|Απρ|Μαΐ|Ιουν|Ιουλ|Αυγ|Σεπ|Οκτ|Νοε|Δεκ",
    long: "Ιανουάριος|Φεβρουάριος|Μάρτιος|Απρίλιος|Μάιος|Ιούνιος|Ιούλιος|Αύγουστος|Σεπτέμβριος|Οκτώβριος|Νοέμβριος|Δεκέμβριος",
    narrow: "Ι|Φ|Μ|Α|Μ|Ι|Ι|Α|Σ|Ο|Ν|Δ",
    short_with_day: "",
    long_with_day: "Ιανουαρίου|Φεβρουαρίου|Μαρτίου|Απριλίου|Μαΐου|Ιουνίου|Ιουλίου|Αυγούστου|Σεπτεμβρίου|Οκτωβρίου|Νοεμβρίου|Δεκεμβρίου",
    days_short: "Κυρ|Δευ|Τρί|Τετ|Πέμ|Παρ|Σάβ",
    days_long: "Κυριακή|Δευτέρα|Τρίτη|Τετάρτη|Πέμπτη|Παρασκευή|Σάββατο",
};
pub(crate) static EN_AU: Names = Names {
    short: "Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sept|Oct|Nov|Dec",
    long: "January|February|March|April|May|June|July|August|September|October|November|December",
    narrow: "J|F|M|A|M|J|J|A|S|O|N|D",
    short_with_day: "Jan|Feb|Mar|Apr|May|June|July|Aug|Sept|Oct|Nov|Dec",
    long_with_day: "",
    days_short: "Sun|Mon|Tue|Wed|Thu|Fri|Sat",
    days_long: "Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday",
};
pub(crate) static EN_US: Names = Names {
    short: "Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec",
    long: "January|February|March|April|May|June|July|August|September|October|November|December",
    narrow: "J|F|M|A|M|J|J|A|S|O|N|D",
    short_with_day: "",
    long_with_day: "",
    days_short: "Sun|Mon|Tue|Wed|Thu|Fri|Sat",
    days_long: "Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday",
};
pub(crate) static EN_GB: Names = Names {
    short: "Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sept|Oct|Nov|Dec",
    long: "January|February|March|April|May|June|July|August|September|October|November|December",
    narrow: "J|F|M|A|M|J|J|A|S|O|N|D",
    short_with_day: "",
    long_with_day: "",
    days_short: "Sun|Mon|Tue|Wed|Thu|Fri|Sat",
    days_long: "Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday",
};
pub(crate) static ES_419: Names = Names {
    short: "ene|feb|mar|abr|may|jun|jul|ago|sept|oct|nov|dic",
    long: "enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre",
    narrow: "E|F|M|A|M|J|J|A|S|O|N|D",
    short_with_day: "",
    long_with_day: "",
    days_short: "dom|lun|mar|mié|jue|vie|sáb",
    days_long: "domingo|lunes|martes|miércoles|jueves|viernes|sábado",
};
pub(crate) static ES_CL: Names = Names {
    short: "ene.|feb.|mar.|abr.|may.|jun.|jul.|ago.|sept.|oct.|nov.|dic.",
    long: "enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre",
    narrow: "E|F|M|A|M|J|J|A|S|O|N|D",
    short_with_day: "ene|feb|mar|abr|may|jun|jul|ago|sept|oct|nov|dic",
    long_with_day: "",
    days_short: "dom|lun|mar|mié|jue|vie|sáb",
    days_long: "domingo|lunes|martes|miércoles|jueves|viernes|sábado",
};
pub(crate) static ES_MX: Names = Names {
    short: "ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic",
    long: "enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre",
    narrow: "E|F|M|A|M|J|J|A|S|O|N|D",
    short_with_day: "",
    long_with_day: "",
    days_short: "dom|lun|mar|mié|jue|vie|sáb",
    days_long: "domingo|lunes|martes|miércoles|jueves|viernes|sábado",
};
pub(crate) static ES_PE: Names = Names {
    short: "ene.|feb.|mar.|abr.|may.|jun.|jul.|ago.|set.|oct.|nov.|dic.",
    long: "enero|febrero|marzo|abril|mayo|junio|julio|agosto|setiembre|octubre|noviembre|diciembre",
    narrow: "E|F|M|A|M|J|J|A|S|O|N|D",
    short_with_day: "",
    long_with_day: "",
    days_short: "dom|lun|mar|mié|jue|vie|sáb",
    days_long: "domingo|lunes|martes|miércoles|jueves|viernes|sábado",
};
pub(crate) static ES_PY: Names = Names {
    short: "ene.|feb.|mar.|abr.|may.|jun.|jul.|ago.|sept.|oct.|nov.|dic.",
    long: "enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre",
    narrow: "E|F|M|A|M|J|J|A|S|O|N|D",
    short_with_day: "",
    long_with_day: "",
    days_short: "dom|lun|mar|mié|jue|vie|sáb",
    days_long: "domingo|lunes|martes|miércoles|jueves|viernes|sábado",
};
pub(crate) static ET_EE: Names = Names {
    short: "jaan|veebr|märts|apr|mai|juuni|juuli|aug|sept|okt|nov|dets",
    long: "jaanuar|veebruar|märts|aprill|mai|juuni|juuli|august|september|oktoober|november|detsember",
    narrow: "J|V|M|A|M|J|J|A|S|O|N|D",
    short_with_day: "",
    long_with_day: "",
    days_short: "P|E|T|K|N|R|L",
    days_long: "pühapäev|esmaspäev|teisipäev|kolmapäev|neljapäev|reede|laupäev",
};
pub(crate) static EU_ES: Names = Names {
    short: "urt.|ots.|mar.|api.|mai.|eka.|uzt.|abu.|ira.|urr.|aza.|abe.",
    long: "urtarrila|otsaila|martxoa|apirila|maiatza|ekaina|uztaila|abuztua|iraila|urria|azaroa|abendua",
    narrow: "U|O|M|A|M|E|U|A|I|U|A|A",
    short_with_day: "",
    long_with_day: "",
    days_short: "ig.|al.|ar.|az.|og.|or.|lr.",
    days_long: "igandea|astelehena|asteartea|asteazkena|osteguna|ostirala|larunbata",
};
pub(crate) static FI_FI: Names = Names {
    short: "tammi|helmi|maalis|huhti|touko|kesä|heinä|elo|syys|loka|marras|joulu",
    long: "tammikuu|helmikuu|maaliskuu|huhtikuu|toukokuu|kesäkuu|heinäkuu|elokuu|syyskuu|lokakuu|marraskuu|joulukuu",
    narrow: "T|H|M|H|T|K|H|E|S|L|M|J",
    short_with_day: "",
    long_with_day: "tammikuuta|helmikuuta|maaliskuuta|huhtikuuta|toukokuuta|kesäkuuta|heinäkuuta|elokuuta|syyskuuta|lokakuuta|marraskuuta|joulukuuta",
    days_short: "su|ma|ti|ke|to|pe|la",
    days_long: "sunnuntai|maanantai|tiistai|keskiviikko|torstai|perjantai|lauantai",
};
pub(crate) static FIL_PH: Names = Names {
    short: "Ene|Peb|Mar|Abr|May|Hun|Hul|Ago|Set|Okt|Nob|Dis",
    long: "Enero|Pebrero|Marso|Abril|Mayo|Hunyo|Hulyo|Agosto|Setyembre|Oktubre|Nobyembre|Disyembre",
    narrow: "E|P|M|A|M|Hun|Hul|Ago|Set|Okt|Nob|Dis",
    short_with_day: "",
    long_with_day: "",
    days_short: "Lin|Lun|Mar|Miy|Huw|Biy|Sab",
    days_long: "Linggo|Lunes|Martes|Miyerkules|Huwebes|Biyernes|Sabado",
};
pub(crate) static FR_BE: Names = Names {
    short: "janv.|févr.|mars|avr.|mai|juin|juil.|août|sept.|oct.|nov.|déc.",
    long: "janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre",
    narrow: "J|F|M|A|M|J|J|A|S|O|N|D",
    short_with_day: "",
    long_with_day: "",
    days_short: "dim.|lun.|mar.|mer.|jeu.|ven.|sam.",
    days_long: "dimanche|lundi|mardi|mercredi|jeudi|vendredi|samedi",
};
pub(crate) static FR_CA: Names = Names {
    short: "janv.|févr.|mars|avr.|mai|juin|juill.|août|sept.|oct.|nov.|déc.",
    long: "janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre",
    narrow: "J|F|M|A|M|J|J|A|S|O|N|D",
    short_with_day: "",
    long_with_day: "",
    days_short: "dim.|lun.|mar.|mer.|jeu.|ven.|sam.",
    days_long: "dimanche|lundi|mardi|mercredi|jeudi|vendredi|samedi",
};
pub(crate) static GA_IE: Names = Names {
    short: "Ean|Feabh|Márta|Aib|Beal|Meith|Iúil|Lún|MFómh|DFómh|Samh|Noll",
    long: "Eanáir|Feabhra|Márta|Aibreán|Bealtaine|Meitheamh|Iúil|Lúnasa|Meán Fómhair|Deireadh Fómhair|Samhain|Nollaig",
    narrow: "E|F|M|A|B|M|I|L|M|D|S|N",
    short_with_day: "",
    long_with_day: "",
    days_short: "Domh|Luan|Máirt|Céad|Déar|Aoine|Sath",
    days_long: "Dé Domhnaigh|Dé Luain|Dé Máirt|Dé Céadaoin|Déardaoin|Dé hAoine|Dé Sathairn",
};
pub(crate) static GL_ES: Names = Names {
    short: "xan.|feb.|mar.|abr.|maio|xuño|xul.|ago.|set.|out.|nov.|dec.",
    long: "xaneiro|febreiro|marzo|abril|maio|xuño|xullo|agosto|setembro|outubro|novembro|decembro",
    narrow: "X|F|M|A|M|X|X|A|S|O|N|D",
    short_with_day: "",
    long_with_day: "",
    days_short: "dom.|luns|mar.|mér.|xov.|ven.|sáb.",
    days_long: "domingo|luns|martes|mércores|xoves|venres|sábado",
};
pub(crate) static GU_IN: Names = Names {
    short: "જાન્યુ|ફેબ્રુ|માર્ચ|એપ્રિલ|મે|જૂન|જુલાઈ|ઑગસ્ટ|સપ્ટે|ઑક્ટો|નવે|ડિસે",
    long: "જાન્યુઆરી|ફેબ્રુઆરી|માર્ચ|એપ્રિલ|મે|જૂન|જુલાઈ|ઑગસ્ટ|સપ્ટેમ્બર|ઑક્ટોબર|નવેમ્બર|ડિસેમ્બર",
    narrow: "જા|ફે|મા|એ|મે|જૂ|જુ|ઑ|સ|ઑ|ન|ડિ",
    short_with_day: "",
    long_with_day: "",
    days_short: "રવિ|સોમ|મંગળ|બુધ|ગુરુ|શુક્ર|શનિ",
    days_long: "રવિવાર|સોમવાર|મંગળવાર|બુધવાર|ગુરુવાર|શુક્રવાર|શનિવાર",
};
pub(crate) static HE_IL: Names = Names {
    short: "ינו׳|פבר׳|מרץ|אפר׳|מאי|יוני|יולי|אוג׳|ספט׳|אוק׳|נוב׳|דצמ׳",
    long: "ינואר|פברואר|מרץ|אפריל|מאי|יוני|יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר",
    narrow: "1|2|3|4|5|6|7|8|9|10|11|12",
    short_with_day: "",
    long_with_day: "",
    days_short: "יום א׳|יום ב׳|יום ג׳|יום ד׳|יום ה׳|יום ו׳|שבת",
    days_long: "יום ראשון|יום שני|יום שלישי|יום רביעי|יום חמישי|יום שישי|יום שבת",
};
pub(crate) static HI_IN: Names = Names {
    short: "जन॰|फ़र॰|मार्च|अप्रैल|मई|जून|जुल॰|अग॰|सित॰|अक्टू॰|नव॰|दिस॰",
    long: "जनवरी|फ़रवरी|मार्च|अप्रैल|मई|जून|जुलाई|अगस्त|सितंबर|अक्टूबर|नवंबर|दिसंबर",
    narrow: "ज|फ़|मा|अ|म|जू|जु|अ|सि|अ|न|दि",
    short_with_day: "",
    long_with_day: "",
    days_short: "रवि|सोम|मंगल|बुध|गुरु|शुक्र|शनि",
    days_long: "रविवार|सोमवार|मंगलवार|बुधवार|गुरुवार|शुक्रवार|शनिवार",
};
pub(crate) static HR_HR: Names = Names {
    short: "sij|velj|ožu|tra|svi|lip|srp|kol|ruj|lis|stu|pro",
    long: "siječanj|veljača|ožujak|travanj|svibanj|lipanj|srpanj|kolovoz|rujan|listopad|studeni|prosinac",
    narrow: "1.|2.|3.|4.|5.|6.|7.|8.|9.|10.|11.|12.",
    short_with_day: "",
    long_with_day: "siječnja|veljače|ožujka|travnja|svibnja|lipnja|srpnja|kolovoza|rujna|listopada|studenoga|prosinca",
    days_short: "ned|pon|uto|sri|čet|pet|sub",
    days_long: "nedjelja|ponedjeljak|utorak|srijeda|četvrtak|petak|subota",
};
pub(crate) static HU_HU: Names = Names {
    short: "jan.|febr.|márc.|ápr.|máj.|jún.|júl.|aug.|szept.|okt.|nov.|dec.",
    long: "január|február|március|április|május|június|július|augusztus|szeptember|október|november|december",
    narrow: "J|F|M|Á|M|J|J|A|Sz|O|N|D",
    short_with_day: "",
    long_with_day: "",
    days_short: "V|H|K|Sze|Cs|P|Szo",
    days_long: "vasárnap|hétfő|kedd|szerda|csütörtök|péntek|szombat",
};
pub(crate) static HY_AM: Names = Names {
    short: "հնվ|փտվ|մրտ|ապր|մյս|հնս|հլս|օգս|սեպ|հոկ|նոյ|դեկ",
    long: "հունվար|փետրվար|մարտ|ապրիլ|մայիս|հունիս|հուլիս|օգոստոս|սեպտեմբեր|հոկտեմբեր|նոյեմբեր|դեկտեմբեր",
    narrow: "Հ|Փ|Մ|Ա|Մ|Հ|Հ|Օ|Ս|Հ|Ն|Դ",
    short_with_day: "",
    long_with_day: "հունվարի|փետրվարի|մարտի|ապրիլի|մայիսի|հունիսի|հուլիսի|օգոստոսի|սեպտեմբերի|հոկտեմբերի|նոյեմբերի|դեկտեմբերի",
    days_short: "կիր|երկ|երք|չրք|հնգ|ուր|շբթ",
    days_long: "կիրակի|երկուշաբթի|երեքշաբթի|չորեքշաբթի|հինգշաբթի|ուրբաթ|շաբաթ",
};
pub(crate) static ID_ID: Names = Names {
    short: "Jan|Feb|Mar|Apr|Mei|Jun|Jul|Agu|Sep|Okt|Nov|Des",
    long: "Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember",
    narrow: "J|F|M|A|M|J|J|A|S|O|N|D",
    short_with_day: "",
    long_with_day: "",
    days_short: "Min|Sen|Sel|Rab|Kam|Jum|Sab",
    days_long: "Minggu|Senin|Selasa|Rabu|Kamis|Jumat|Sabtu",
};
pub(crate) static IS_IS: Names = Names {
    short: "jan.|feb.|mar.|apr.|maí|jún.|júl.|ágú.|sep.|okt.|nóv.|des.",
    long: "janúar|febrúar|mars|apríl|maí|júní|júlí|ágúst|september|október|nóvember|desember",
    narrow: "J|F|M|A|M|J|J|Á|S|O|N|D",
    short_with_day: "",
    long_with_day: "",
    days_short: "sun.|mán.|þri.|mið.|fim.|fös.|lau.",
    days_long: "sunnudagur|mánudagur|þriðjudagur|miðvikudagur|fimmtudagur|föstudagur|laugardagur",
};
pub(crate) static IT_CH: Names = Names {
    short: "gen|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic",
    long: "gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre",
    narrow: "G|F|M|A|M|G|L|A|S|O|N|D",
    short_with_day: "",
    long_with_day: "",
    days_short: "dom|lun|mar|mer|gio|ven|sab",
    days_long: "domenica|lunedì|martedì|mercoledì|giovedì|venerdì|sabato",
};
pub(crate) static JA_JP: Names = Names {
    short: "1月|2月|3月|4月|5月|6月|7月|8月|9月|10月|11月|12月",
    long: "1月|2月|3月|4月|5月|6月|7月|8月|9月|10月|11月|12月",
    narrow: "1月|2月|3月|4月|5月|6月|7月|8月|9月|10月|11月|12月",
    short_with_day: "",
    long_with_day: "",
    days_short: "日|月|火|水|木|金|土",
    days_long: "日曜日|月曜日|火曜日|水曜日|木曜日|金曜日|土曜日",
};
pub(crate) static KA_GE: Names = Names {
    short: "იან|თებ|მარ|აპრ|მაი|ივნ|ივლ|აგვ|სექ|ოქტ|ნოე|დეკ",
    long: "იანვარი|თებერვალი|მარტი|აპრილი|მაისი|ივნისი|ივლისი|აგვისტო|სექტემბერი|ოქტომბერი|ნოემბერი|დეკემბერი",
    narrow: "ი|თ|მ|ა|მ|ი|ი|ა|ს|ო|ნ|დ",
    short_with_day: "",
    long_with_day: "",
    days_short: "კვი|ორშ|სამ|ოთხ|ხუთ|პარ|შაბ",
    days_long: "კვირა|ორშაბათი|სამშაბათი|ოთხშაბათი|ხუთშაბათი|პარასკევი|შაბათი",
};
pub(crate) static KK_KZ: Names = Names {
    short: "қаң.|ақп.|нау.|сәу.|мам.|мау.|шіл.|там.|қыр.|қаз.|қар.|жел.",
    long: "қаңтар|ақпан|наурыз|сәуір|мамыр|маусым|шілде|тамыз|қыркүйек|қазан|қараша|желтоқсан",
    narrow: "Қ|А|Н|С|М|М|Ш|Т|Қ|Қ|Қ|Ж",
    short_with_day: "",
    long_with_day: "",
    days_short: "жс|дс|сс|ср|бс|жм|сб",
    days_long: "жексенбі|дүйсенбі|сейсенбі|сәрсенбі|бейсенбі|жұма|сенбі",
};
pub(crate) static KM_KH: Names = Names {
    short: "មករា|កុម្ភៈ|មីនា|មេសា|ឧសភា|មិថុនា|កក្កដា|សីហា|កញ្ញា|តុលា|វិច្ឆិកា|ធ្នូ",
    long: "មករា|កុម្ភៈ|មីនា|មេសា|ឧសភា|មិថុនា|កក្កដា|សីហា|កញ្ញា|តុលា|វិច្ឆិកា|ធ្នូ",
    narrow: "ម|ក|ម|ម|ឧ|ម|ក|ស|ក|ត|វ|ធ",
    short_with_day: "",
    long_with_day: "",
    days_short: "អាទិត្យ|ចន្ទ|អង្គារ|ពុធ|ព្រហ|សុក្រ|សៅរ៍",
    days_long: "អាទិត្យ|ចន្ទ|អង្គារ|ពុធ|ព្រហស្បតិ៍|សុក្រ|សៅរ៍",
};
pub(crate) static KN_IN: Names = Names {
    short: "ಜನ|ಫೆಬ್ರ|ಮಾರ್ಚ್|ಏಪ್ರಿ|ಮೇ|ಜೂನ್|ಜುಲೈ|ಆಗ|ಸೆಪ್ಟೆಂ|ಅಕ್ಟೋ|ನವೆಂ|ಡಿಸೆಂ",
    long: "ಜನವರಿ|ಫೆಬ್ರವರಿ|ಮಾರ್ಚ್|ಏಪ್ರಿಲ್|ಮೇ|ಜೂನ್|ಜುಲೈ|ಆಗಸ್ಟ್|ಸೆಪ್ಟೆಂಬರ್|ಅಕ್ಟೋಬರ್|ನವೆಂಬರ್|ಡಿಸೆಂಬರ್",
    narrow: "ಜ|ಫೆ|ಮಾ|ಏ|ಮೇ|ಜೂ|ಜು|ಆ|ಸೆ|ಅ|ನ|ಡಿ",
    short_with_day: "",
    long_with_day: "",
    days_short: "ಭಾನು|ಸೋಮ|ಮಂಗಳ|ಬುಧ|ಗುರು|ಶುಕ್ರ|ಶನಿ",
    days_long: "ಭಾನುವಾರ|ಸೋಮವಾರ|ಮಂಗಳವಾರ|ಬುಧವಾರ|ಗುರುವಾರ|ಶುಕ್ರವಾರ|ಶನಿವಾರ",
};
pub(crate) static KO_KR: Names = Names {
    short: "1월|2월|3월|4월|5월|6월|7월|8월|9월|10월|11월|12월",
    long: "1월|2월|3월|4월|5월|6월|7월|8월|9월|10월|11월|12월",
    narrow: "1월|2월|3월|4월|5월|6월|7월|8월|9월|10월|11월|12월",
    short_with_day: "",
    long_with_day: "",
    days_short: "일|월|화|수|목|금|토",
    days_long: "일요일|월요일|화요일|수요일|목요일|금요일|토요일",
};
pub(crate) static KY_KG: Names = Names {
    short: "Янв|Фев|Мар|Апр|Май|Июн|Июл|Авг|Сен|Окт|Ноя|Дек",
    long: "январь|февраль|март|апрель|май|июнь|июль|август|сентябрь|октябрь|ноябрь|декабрь",
    narrow: "Я|Ф|М|А|М|И|И|А|С|О|Н|Д",
    short_with_day: "янв.|фев.|мар.|апр.|май|июн.|июл.|авг.|сен.|окт.|ноя.|дек.",
    long_with_day: "",
    days_short: "жек.|дүй.|шейш.|шарш.|бейш.|жума|ишм.",
    days_long: "жекшемби|дүйшөмбү|шейшемби|шаршемби|бейшемби|жума|ишемби",
};
pub(crate) static LB_LU: Names = Names {
    short: "Jan|Feb|Mäe|Abr|Mee|Jun|Jul|Aug|Sep|Okt|Nov|Dez",
    long: "Januar|Februar|Mäerz|Abrëll|Mee|Juni|Juli|August|September|Oktober|November|Dezember",
    narrow: "J|F|M|A|M|J|J|A|S|O|N|D",
    short_with_day: "Jan.|Feb.|Mäe.|Abr.|Mee|Juni|Juli|Aug.|Sep.|Okt.|Nov.|Dez.",
    long_with_day: "",
    days_short: "Son|Méi|Dën|Mët|Don|Fre|Sam",
    days_long: "Sonndeg|Méindeg|Dënschdeg|Mëttwoch|Donneschdeg|Freideg|Samschdeg",
};
pub(crate) static LO_LA: Names = Names {
    short: "ມ.ກ.|ກ.ພ.|ມ.ນ.|ມ.ສ.|ພ.ພ.|ມິ.ຖ.|ກ.ລ.|ສ.ຫ.|ກ.ຍ.|ຕ.ລ.|ພ.ຈ.|ທ.ວ.",
    long: "ມັງກອນ|ກຸມພາ|ມີນາ|ເມສາ|ພຶດສະພາ|ມິຖຸນາ|ກໍລະກົດ|ສິງຫາ|ກັນຍາ|ຕຸລາ|ພະຈິກ|ທັນວາ",
    narrow: "1|2|3|4|5|6|7|8|9|10|11|12",
    short_with_day: "",
    long_with_day: "",
    days_short: "ອາທິດ|ຈັນ|ອັງຄານ|ພຸດ|ພະຫັດ|ສຸກ|ເສົາ",
    days_long: "ວັນອາທິດ|ວັນຈັນ|ວັນອັງຄານ|ວັນພຸດ|ວັນພະຫັດ|ວັນສຸກ|ວັນເສົາ",
};
pub(crate) static LT_LT: Names = Names {
    short: "saus.|vas.|kov.|bal.|geg.|birž.|liep.|rugp.|rugs.|spal.|lapkr.|gruod.",
    long: "sausis|vasaris|kovas|balandis|gegužė|birželis|liepa|rugpjūtis|rugsėjis|spalis|lapkritis|gruodis",
    narrow: "01|02|03|04|05|06|07|08|09|10|11|12",
    short_with_day: "",
    long_with_day: "sausio|vasario|kovo|balandžio|gegužės|birželio|liepos|rugpjūčio|rugsėjo|spalio|lapkričio|gruodžio",
    days_short: "sk|pr|an|tr|kt|pn|št",
    days_long: "sekmadienis|pirmadienis|antradienis|trečiadienis|ketvirtadienis|penktadienis|šeštadienis",
};
pub(crate) static LV_LV: Names = Names {
    short: "janv.|febr.|marts|apr.|maijs|jūn.|jūl.|aug.|sept.|okt.|nov.|dec.",
    long: "janvāris|februāris|marts|aprīlis|maijs|jūnijs|jūlijs|augusts|septembris|oktobris|novembris|decembris",
    narrow: "J|F|M|A|M|J|J|A|S|O|N|D",
    short_with_day: "",
    long_with_day: "",
    days_short: "Svētd.|Pirmd.|Otrd.|Trešd.|Ceturtd.|Piektd.|Sestd.",
    days_long: "Svētdiena|Pirmdiena|Otrdiena|Trešdiena|Ceturtdiena|Piektdiena|Sestdiena",
};
pub(crate) static MK_MK: Names = Names {
    short: "јан.|фев.|мар.|апр.|мај|јун.|јул.|авг.|сеп.|окт.|ное.|дек.",
    long: "јануари|февруари|март|април|мај|јуни|јули|август|септември|октомври|ноември|декември",
    narrow: "ј|ф|м|а|м|ј|ј|а|с|о|н|д",
    short_with_day: "",
    long_with_day: "",
    days_short: "нед.|пон.|вто.|сре.|чет.|пет.|саб.",
    days_long: "недела|понеделник|вторник|среда|четврток|петок|сабота",
};
pub(crate) static ML_IN: Names = Names {
    short: "ജനു|ഫെബ്രു|മാർ|ഏപ്രി|മേയ്|ജൂൺ|ജൂലൈ|ഓഗ|സെപ്റ്റം|ഒക്ടോ|നവം|ഡിസം",
    long: "ജനുവരി|ഫെബ്രുവരി|മാർച്ച്|ഏപ്രിൽ|മേയ്|ജൂൺ|ജൂലൈ|ഓഗസ്റ്റ്|സെപ്റ്റംബർ|ഒക്‌ടോബർ|നവംബർ|ഡിസംബർ",
    narrow: "ജ|ഫെ|മാ|ഏ|മെ|ജൂൺ|ജൂ|ഓ|സെ|ഒ|ന|ഡി",
    short_with_day: "",
    long_with_day: "",
    days_short: "ഞായർ|തിങ്കൾ|ചൊവ്വ|ബുധൻ|വ്യാഴം|വെള്ളി|ശനി",
    days_long: "ഞായറാഴ്‌ച|തിങ്കളാഴ്‌ച|ചൊവ്വാഴ്‌ച|ബുധനാഴ്‌ച|വ്യാഴാഴ്‌ച|വെള്ളിയാഴ്‌ച|ശനിയാഴ്‌ച",
};
pub(crate) static MN_MN: Names = Names {
    short: "1-р сар|2-р сар|3-р сар|4-р сар|5-р сар|6-р сар|7-р сар|8-р сар|9-р сар|10-р сар|11-р сар|12-р сар",
    long: "нэгдүгээр сар|хоёрдугаар сар|гуравдугаар сар|дөрөвдүгээр сар|тавдугаар сар|зургаадугаар сар|долоодугаар сар|наймдугаар сар|есдүгээр сар|аравдугаар сар|арван нэгдүгээр сар|арван хоёрдугаар сар",
    narrow: "I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII",
    short_with_day: "",
    long_with_day: "",
    days_short: "Ня|Да|Мя|Лх|Пү|Ба|Бя",
    days_long: "Ням|Даваа|Мягмар|Лхагва|Пүрэв|Баасан|Бямба",
};
pub(crate) static MS_MY: Names = Names {
    short: "Jan|Feb|Mac|Apr|Mei|Jun|Jul|Ogo|Sep|Okt|Nov|Dis",
    long: "Januari|Februari|Mac|April|Mei|Jun|Julai|Ogos|September|Oktober|November|Disember",
    narrow: "J|F|M|A|M|J|J|O|S|O|N|D",
    short_with_day: "",
    long_with_day: "",
    days_short: "Ahd|Isn|Sel|Rab|Kha|Jum|Sab",
    days_long: "Ahad|Isnin|Selasa|Rabu|Khamis|Jumaat|Sabtu",
};
pub(crate) static MT_MT: Names = Names {
    short: "Jan|Fra|Mar|Apr|Mej|Ġun|Lul|Aww|Set|Ott|Nov|Diċ",
    long: "Jannar|Frar|Marzu|April|Mejju|Ġunju|Lulju|Awwissu|Settembru|Ottubru|Novembru|Diċembru",
    narrow: "Jn|Fr|Mz|Ap|Mj|Ġn|Lj|Aw|St|Ob|Nv|Dċ",
    short_with_day: "",
    long_with_day: "",
    days_short: "Ħad|Tne|Tli|Erb|Ħam|Ġim|Sib",
    days_long: "Il-Ħadd|It-Tnejn|It-Tlieta|L-Erbgħa|Il-Ħamis|Il-Ġimgħa|Is-Sibt",
};
pub(crate) static NB_NO: Names = Names {
    short: "jan|feb|mar|apr|mai|jun|jul|aug|sep|okt|nov|des",
    long: "januar|februar|mars|april|mai|juni|juli|august|september|oktober|november|desember",
    narrow: "J|F|M|A|M|J|J|A|S|O|N|D",
    short_with_day: "jan.|feb.|mars|apr.|mai|juni|juli|aug.|sep.|okt.|nov.|des.",
    long_with_day: "",
    days_short: "søn.|man.|tir.|ons.|tor.|fre.|lør.",
    days_long: "søndag|mandag|tirsdag|onsdag|torsdag|fredag|lørdag",
};
pub(crate) static NL_BE: Names = Names {
    short: "jan|feb|mrt|apr|mei|jun|jul|aug|sep|okt|nov|dec",
    long: "januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december",
    narrow: "J|F|M|A|M|J|J|A|S|O|N|D",
    short_with_day: "",
    long_with_day: "",
    days_short: "zo|ma|di|wo|do|vr|za",
    days_long: "zondag|maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag",
};
pub(crate) static PA_IN: Names = Names {
    short: "ਜਨ|ਫ਼ਰ|ਮਾਰਚ|ਅਪ੍ਰੈ|ਮਈ|ਜੂਨ|ਜੁਲਾ|ਅਗ|ਸਤੰ|ਅਕਤੂ|ਨਵੰ|ਦਸੰ",
    long: "ਜਨਵਰੀ|ਫ਼ਰਵਰੀ|ਮਾਰਚ|ਅਪ੍ਰੈਲ|ਮਈ|ਜੂਨ|ਜੁਲਾਈ|ਅਗਸਤ|ਸਤੰਬਰ|ਅਕਤੂਬਰ|ਨਵੰਬਰ|ਦਸੰਬਰ",
    narrow: "ਜ|ਫ਼|ਮਾ|ਅ|ਮ|ਜੂ|ਜੁ|ਅ|ਸ|ਅ|ਨ|ਦ",
    short_with_day: "",
    long_with_day: "",
    days_short: "ਐਤ|ਸੋਮ|ਮੰਗਲ|ਬੁੱਧ|ਵੀਰ|ਸ਼ੁੱਕਰ|ਸ਼ਨੀ",
    days_long: "ਐਤਵਾਰ|ਸੋਮਵਾਰ|ਮੰਗਲਵਾਰ|ਬੁੱਧਵਾਰ|ਵੀਰਵਾਰ|ਸ਼ੁੱਕਰਵਾਰ|ਸ਼ਨੀਵਾਰ",
};
pub(crate) static PL_PL: Names = Names {
    short: "sty|lut|mar|kwi|maj|cze|lip|sie|wrz|paź|lis|gru",
    long: "styczeń|luty|marzec|kwiecień|maj|czerwiec|lipiec|sierpień|wrzesień|październik|listopad|grudzień",
    narrow: "S|L|M|K|M|C|L|S|W|P|L|G",
    short_with_day: "",
    long_with_day: "stycznia|lutego|marca|kwietnia|maja|czerwca|lipca|sierpnia|września|października|listopada|grudnia",
    days_short: "niedz.|pon.|wt.|śr.|czw.|pt.|sob.",
    days_long: "niedziela|poniedziałek|wtorek|środa|czwartek|piątek|sobota",
};
pub(crate) static PT_BR: Names = Names {
    short: "jan.|fev.|mar.|abr.|mai.|jun.|jul.|ago.|set.|out.|nov.|dez.",
    long: "janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro",
    narrow: "J|F|M|A|M|J|J|A|S|O|N|D",
    short_with_day: "",
    long_with_day: "",
    days_short: "dom.|seg.|ter.|qua.|qui.|sex.|sáb.",
    days_long: "domingo|segunda-feira|terça-feira|quarta-feira|quinta-feira|sexta-feira|sábado",
};
pub(crate) static PT_PT: Names = Names {
    short: "jan.|fev.|mar.|abr.|mai.|jun.|jul.|ago.|set.|out.|nov.|dez.",
    long: "janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro",
    narrow: "J|F|M|A|M|J|J|A|S|O|N|D",
    short_with_day: "",
    long_with_day: "",
    days_short: "domingo|segunda|terça|quarta|quinta|sexta|sábado",
    days_long: "domingo|segunda-feira|terça-feira|quarta-feira|quinta-feira|sexta-feira|sábado",
};
pub(crate) static RO_RO: Names = Names {
    short: "ian.|feb.|mar.|apr.|mai|iun.|iul.|aug.|sept.|oct.|nov.|dec.",
    long: "ianuarie|februarie|martie|aprilie|mai|iunie|iulie|august|septembrie|octombrie|noiembrie|decembrie",
    narrow: "I|F|M|A|M|I|I|A|S|O|N|D",
    short_with_day: "",
    long_with_day: "",
    days_short: "dum.|lun.|mar.|mie.|joi|vin.|sâm.",
    days_long: "duminică|luni|marți|miercuri|joi|vineri|sâmbătă",
};
pub(crate) static RU_RU: Names = Names {
    short: "янв.|февр.|март|апр.|май|июнь|июль|авг.|сент.|окт.|нояб.|дек.",
    long: "январь|февраль|март|апрель|май|июнь|июль|август|сентябрь|октябрь|ноябрь|декабрь",
    narrow: "Я|Ф|М|А|М|И|И|А|С|О|Н|Д",
    short_with_day: "янв.|февр.|мар.|апр.|мая|июн.|июл.|авг.|сент.|окт.|нояб.|дек.",
    long_with_day: "января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря",
    days_short: "вс|пн|вт|ср|чт|пт|сб",
    days_long: "воскресенье|понедельник|вторник|среда|четверг|пятница|суббота",
};
pub(crate) static SI_LK: Names = Names {
    short: "දුරුතු|නවම්|මැදින්|බක්|වෙසක්|පොසොන්|ඇසළ|නිකිණි|බිනර|වප්|ඉල්|උඳුවප්",
    long: "දුරුතු|නවම්|මැදින්|බක්|වෙසක්|පොසොන්|ඇසළ|නිකිණි|බිනර|වප්|ඉල්|උඳුවප්",
    narrow: "දු|න|මැ|බ|වෙ|පො|ඇ|නි|බි|ව|ඉ|උ",
    short_with_day: "",
    long_with_day: "",
    days_short: "ඉරිදා|සඳුදා|අඟහ|බදාදා|බ්‍රහස්|සිකු|සෙන",
    days_long: "ඉරිදා|සඳුදා|අඟහරුවාදා|බදාදා|බ්‍රහස්පතින්දා|සිකුරාදා|සෙනසුරාදා",
};
pub(crate) static SK_SK: Names = Names {
    short: "jan|feb|mar|apr|máj|jún|júl|aug|sep|okt|nov|dec",
    long: "január|február|marec|apríl|máj|jún|júl|august|september|október|november|december",
    narrow: "j|f|m|a|m|j|j|a|s|o|n|d",
    short_with_day: "",
    long_with_day: "januára|februára|marca|apríla|mája|júna|júla|augusta|septembra|októbra|novembra|decembra",
    days_short: "ne|po|ut|st|št|pi|so",
    days_long: "nedeľa|pondelok|utorok|streda|štvrtok|piatok|sobota",
};
pub(crate) static SL_SI: Names = Names {
    short: "jan.|feb.|mar.|apr.|maj|jun.|jul.|avg.|sep.|okt.|nov.|dec.",
    long: "januar|februar|marec|april|maj|junij|julij|avgust|september|oktober|november|december",
    narrow: "j|f|m|a|m|j|j|a|s|o|n|d",
    short_with_day: "",
    long_with_day: "",
    days_short: "ned.|pon.|tor.|sre.|čet.|pet.|sob.",
    days_long: "nedelja|ponedeljek|torek|sreda|četrtek|petek|sobota",
};
pub(crate) static SQ_AL: Names = Names {
    short: "jan|shk|mar|pri|maj|qer|korr|gush|sht|tet|nën|dhj",
    long: "janar|shkurt|mars|prill|maj|qershor|korrik|gusht|shtator|tetor|nëntor|dhjetor",
    narrow: "j|sh|m|p|m|q|k|g|sh|t|n|dh",
    short_with_day: "",
    long_with_day: "",
    days_short: "die|hën|mar|mër|enj|pre|sht",
    days_long: "e diel|e hënë|e martë|e mërkurë|e enjte|e premte|e shtunë",
};
pub(crate) static SR_RS: Names = Names {
    short: "јан|феб|мар|апр|мај|јун|јул|авг|сеп|окт|нов|дец",
    long: "јануар|фебруар|март|април|мај|јун|јул|август|септембар|октобар|новембар|децембар",
    narrow: "ј|ф|м|а|м|ј|ј|а|с|о|н|д",
    short_with_day: "",
    long_with_day: "",
    days_short: "нед|пон|уто|сре|чет|пет|суб",
    days_long: "недеља|понедељак|уторак|среда|четвртак|петак|субота",
};
pub(crate) static SV_SE: Names = Names {
    short: "jan.|feb.|mars|apr.|maj|juni|juli|aug.|sep.|okt.|nov.|dec.",
    long: "januari|februari|mars|april|maj|juni|juli|augusti|september|oktober|november|december",
    narrow: "J|F|M|A|M|J|J|A|S|O|N|D",
    short_with_day: "",
    long_with_day: "",
    days_short: "sön|mån|tis|ons|tors|fre|lör",
    days_long: "söndag|måndag|tisdag|onsdag|torsdag|fredag|lördag",
};
pub(crate) static SW_KE: Names = Names {
    short: "Jan|Feb|Mac|Apr|Mei|Jun|Jul|Ago|Sep|Okt|Nov|Des",
    long: "Januari|Februari|Machi|Aprili|Mei|Juni|Julai|Agosti|Septemba|Oktoba|Novemba|Desemba",
    narrow: "J|F|M|A|M|J|J|A|S|O|N|D",
    short_with_day: "",
    long_with_day: "",
    days_short: "Jumapili|Jumatatu|Jumanne|Jumatano|Alhamisi|Ijumaa|Jumamosi",
    days_long: "Jumapili|Jumatatu|Jumanne|Jumatano|Alhamisi|Ijumaa|Jumamosi",
};
pub(crate) static TA_IN: Names = Names {
    short: "ஜன.|பிப்.|மார்.|ஏப்.|மே|ஜூன்|ஜூலை|ஆக.|செப்.|அக்.|நவ.|டிச.",
    long: "ஜனவரி|பிப்ரவரி|மார்ச்|ஏப்ரல்|மே|ஜூன்|ஜூலை|ஆகஸ்ட்|செப்டம்பர்|அக்டோபர்|நவம்பர்|டிசம்பர்",
    narrow: "ஜ|பி|மா|ஏ|மே|ஜூ|ஜூ|ஆ|செ|அ|ந|டி",
    short_with_day: "",
    long_with_day: "",
    days_short: "ஞாயி.|திங்.|செவ்.|புத.|வியா.|வெள்.|சனி",
    days_long: "ஞாயிறு|திங்கள்|செவ்வாய்|புதன்|வியாழன்|வெள்ளி|சனி",
};
pub(crate) static TE_IN: Names = Names {
    short: "జన|ఫిబ్ర|మార్చి|ఏప్రి|మే|జూన్|జులై|ఆగ|సెప్టెం|అక్టో|నవం|డిసెం",
    long: "జనవరి|ఫిబ్రవరి|మార్చి|ఏప్రిల్|మే|జూన్|జులై|ఆగస్టు|సెప్టెంబర్|అక్టోబర్|నవంబర్|డిసెంబర్",
    narrow: "జ|ఫి|మా|ఏ|మే|జూ|జు|ఆ|సె|అ|న|డి",
    short_with_day: "",
    long_with_day: "",
    days_short: "ఆది|సోమ|మంగళ|బుధ|గురు|శుక్ర|శని",
    days_long: "ఆదివారం|సోమవారం|మంగళవారం|బుధవారం|గురువారం|శుక్రవారం|శనివారం",
};
pub(crate) static TH_TH: Names = Names {
    short: "ม.ค.|ก.พ.|มี.ค.|เม.ย.|พ.ค.|มิ.ย.|ก.ค.|ส.ค.|ก.ย.|ต.ค.|พ.ย.|ธ.ค.",
    long: "มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม",
    narrow: "ม.ค.|ก.พ.|มี.ค.|เม.ย.|พ.ค.|มิ.ย.|ก.ค.|ส.ค.|ก.ย.|ต.ค.|พ.ย.|ธ.ค.",
    short_with_day: "",
    long_with_day: "",
    days_short: "อาทิตย์|จันทร์|อังคาร|พุธ|พฤหัส|ศุกร์|เสาร์",
    days_long: "วันอาทิตย์|วันจันทร์|วันอังคาร|วันพุธ|วันพฤหัสบดี|วันศุกร์|วันเสาร์",
};
pub(crate) static TR_TR: Names = Names {
    short: "Oca|Şub|Mar|Nis|May|Haz|Tem|Ağu|Eyl|Eki|Kas|Ara",
    long: "Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık",
    narrow: "O|Ş|M|N|M|H|T|A|E|E|K|A",
    short_with_day: "",
    long_with_day: "",
    days_short: "Paz|Pzt|Sal|Çar|Per|Cum|Cmt",
    days_long: "Pazar|Pazartesi|Salı|Çarşamba|Perşembe|Cuma|Cumartesi",
};
pub(crate) static UK_UA: Names = Names {
    short: "січ.|лют.|бер.|квіт.|трав.|черв.|лип.|серп.|вер.|жовт.|лист.|груд.",
    long: "січень|лютий|березень|квітень|травень|червень|липень|серпень|вересень|жовтень|листопад|грудень",
    narrow: "С|Л|Б|К|Т|Ч|Л|С|В|Ж|Л|Г",
    short_with_day: "",
    long_with_day: "січня|лютого|березня|квітня|травня|червня|липня|серпня|вересня|жовтня|листопада|грудня",
    days_short: "нд|пн|вт|ср|чт|пт|сб",
    days_long: "неділя|понеділок|вівторок|середа|четвер|пʼятниця|субота",
};
pub(crate) static UR_PK: Names = Names {
    short: "جنوری|فروری|مارچ|اپریل|مئی|جون|جولائی|اگست|ستمبر|اکتوبر|نومبر|دسمبر",
    long: "جنوری|فروری|مارچ|اپریل|مئی|جون|جولائی|اگست|ستمبر|اکتوبر|نومبر|دسمبر",
    narrow: "J|F|M|A|M|J|J|A|S|O|N|D",
    short_with_day: "",
    long_with_day: "",
    days_short: "اتوار|پیر|منگل|بدھ|جمعرات|جمعہ|ہفتہ",
    days_long: "اتوار|پیر|منگل|بدھ|جمعرات|جمعہ|ہفتہ",
};
pub(crate) static UZ_UZ: Names = Names {
    short: "yan|fev|mar|apr|may|iyn|iyl|avg|sen|okt|noy|dek",
    long: "yanvar|fevral|mart|aprel|may|iyun|iyul|avgust|sentabr|oktabr|noyabr|dekabr",
    narrow: "Y|F|M|A|M|I|I|A|S|O|N|D",
    short_with_day: "",
    long_with_day: "",
    days_short: "Yak|Dush|Sesh|Chor|Pay|Jum|Shan",
    days_long: "yakshanba|dushanba|seshanba|chorshanba|payshanba|juma|shanba",
};
pub(crate) static VI_VN: Names = Names {
    short: "thg 1|thg 2|thg 3|thg 4|thg 5|thg 6|thg 7|thg 8|thg 9|thg 10|thg 11|thg 12",
    long: "tháng 1|tháng 2|tháng 3|tháng 4|tháng 5|tháng 6|tháng 7|tháng 8|tháng 9|tháng 10|tháng 11|tháng 12",
    narrow: "1|2|3|4|5|6|7|8|9|10|11|12",
    short_with_day: "",
    long_with_day: "",
    days_short: "CN|Thứ 2|Thứ 3|Thứ 4|Thứ 5|Thứ 6|Thứ 7",
    days_long: "Chủ Nhật|Thứ Hai|Thứ Ba|Thứ Tư|Thứ Năm|Thứ Sáu|Thứ Bảy",
};
pub(crate) static ZH_CN: Names = Names {
    short: "1月|2月|3月|4月|5月|6月|7月|8月|9月|10月|11月|12月",
    long: "一月|二月|三月|四月|五月|六月|七月|八月|九月|十月|十一月|十二月",
    narrow: "1|2|3|4|5|6|7|8|9|10|11|12",
    short_with_day: "",
    long_with_day: "",
    days_short: "周日|周一|周二|周三|周四|周五|周六",
    days_long: "星期日|星期一|星期二|星期三|星期四|星期五|星期六",
};
pub(crate) static ZH_HK: Names = Names {
    short: "1月|2月|3月|4月|5月|6月|7月|8月|9月|10月|11月|12月",
    long: "1月|2月|3月|4月|5月|6月|7月|8月|9月|10月|11月|12月",
    narrow: "1|2|3|4|5|6|7|8|9|10|11|12",
    short_with_day: "",
    long_with_day: "",
    days_short: "週日|週一|週二|週三|週四|週五|週六",
    days_long: "星期日|星期一|星期二|星期三|星期四|星期五|星期六",
};
pub(crate) static ZH_SG: Names = Names {
    short: "1月|2月|3月|4月|5月|6月|7月|8月|9月|10月|11月|12月",
    long: "1月|2月|3月|4月|5月|6月|7月|8月|9月|10月|11月|12月",
    narrow: "1月|2月|3月|4月|5月|6月|7月|8月|9月|10月|11月|12月",
    short_with_day: "",
    long_with_day: "",
    days_short: "周日|周一|周二|周三|周四|周五|周六",
    days_long: "星期日|星期一|星期二|星期三|星期四|星期五|星期六",
};
pub(crate) static ZU_ZA: Names = Names {
    short: "Jan|Feb|Mas|Eph|Mey|Jun|Jul|Aga|Sep|Okt|Nov|Dis",
    long: "Januwari|Februwari|Mashi|Ephreli|Meyi|Juni|Julayi|Agasti|Septhemba|Okthoba|Novemba|Disemba",
    narrow: "J|F|M|A|M|J|J|A|S|O|N|D",
    short_with_day: "",
    long_with_day: "",
    days_short: "Son|Mso|Bil|Tha|Sin|Hla|Mgq",
    days_long: "ISonto|UMsombuluko|ULwesibili|ULwesithathu|ULwesine|ULwesihlanu|UMgqibelo",
};

static TAGS: [(&str, &Names); 108] = [
    ("af-ZA", &AF_ZA),
    ("am-ET", &AM_ET),
    ("ar-AE", &AR_AE),
    ("ar-DZ", &AR_DZ),
    ("ar-TN", &AR_DZ),
    ("ar-MA", &AR_MA),
    ("az-AZ", &AZ_AZ),
    ("be-BY", &BE_BY),
    ("bg-BG", &BG_BG),
    ("bs-BA", &BS_BA),
    ("ca-ES", &CA_ES),
    ("cs-CZ", &CS_CZ),
    ("cy-GB", &CY_GB),
    ("da-DK", &DA_DK),
    ("de-AT", &DE_AT),
    ("de-CH", &DE_CH),
    ("de-DE", &DE_CH),
    ("el-GR", &EL_GR),
    ("en-AU", &EN_AU),
    ("en-CA", &EN_US),
    ("en-PH", &EN_US),
    ("en-US", &EN_US),
    ("en-GB", &EN_GB),
    ("en-HK", &EN_GB),
    ("en-IE", &EN_GB),
    ("en-IN", &EN_GB),
    ("en-NZ", &EN_GB),
    ("en-SG", &EN_GB),
    ("en-ZA", &EN_GB),
    ("es-419", &ES_419),
    ("es-AR", &ES_419),
    ("es-BO", &ES_419),
    ("es-CR", &ES_419),
    ("es-EC", &ES_419),
    ("es-ES", &ES_419),
    ("es-US", &ES_419),
    ("es-CL", &ES_CL),
    ("es-CO", &ES_CL),
    ("es-MX", &ES_MX),
    ("es-PE", &ES_PE),
    ("es-UY", &ES_PE),
    ("es-PY", &ES_PY),
    ("es-VE", &ES_PY),
    ("et-EE", &ET_EE),
    ("eu-ES", &EU_ES),
    ("fi-FI", &FI_FI),
    ("fil-PH", &FIL_PH),
    ("fr-BE", &FR_BE),
    ("fr-CH", &FR_BE),
    ("fr-FR", &FR_BE),
    ("fr-CA", &FR_CA),
    ("ga-IE", &GA_IE),
    ("gl-ES", &GL_ES),
    ("gu-IN", &GU_IN),
    ("he-IL", &HE_IL),
    ("hi-IN", &HI_IN),
    ("hr-HR", &HR_HR),
    ("hu-HU", &HU_HU),
    ("hy-AM", &HY_AM),
    ("id-ID", &ID_ID),
    ("is-IS", &IS_IS),
    ("it-CH", &IT_CH),
    ("it-IT", &IT_CH),
    ("ja-JP", &JA_JP),
    ("ka-GE", &KA_GE),
    ("kk-KZ", &KK_KZ),
    ("km-KH", &KM_KH),
    ("kn-IN", &KN_IN),
    ("ko-KR", &KO_KR),
    ("ky-KG", &KY_KG),
    ("lb-LU", &LB_LU),
    ("lo-LA", &LO_LA),
    ("lt-LT", &LT_LT),
    ("lv-LV", &LV_LV),
    ("mk-MK", &MK_MK),
    ("ml-IN", &ML_IN),
    ("mn-MN", &MN_MN),
    ("ms-MY", &MS_MY),
    ("mt-MT", &MT_MT),
    ("nb-NO", &NB_NO),
    ("nl-BE", &NL_BE),
    ("nl-NL", &NL_BE),
    ("pa-IN", &PA_IN),
    ("pl-PL", &PL_PL),
    ("pt-BR", &PT_BR),
    ("pt-PT", &PT_PT),
    ("ro-RO", &RO_RO),
    ("ru-RU", &RU_RU),
    ("si-LK", &SI_LK),
    ("sk-SK", &SK_SK),
    ("sl-SI", &SL_SI),
    ("sq-AL", &SQ_AL),
    ("sr-RS", &SR_RS),
    ("sv-SE", &SV_SE),
    ("sw-KE", &SW_KE),
    ("ta-IN", &TA_IN),
    ("te-IN", &TE_IN),
    ("th-TH", &TH_TH),
    ("tr-TR", &TR_TR),
    ("uk-UA", &UK_UA),
    ("ur-PK", &UR_PK),
    ("uz-UZ", &UZ_UZ),
    ("vi-VN", &VI_VN),
    ("zh-CN", &ZH_CN),
    ("zh-HK", &ZH_HK),
    ("zh-TW", &ZH_HK),
    ("zh-SG", &ZH_SG),
    ("zu-ZA", &ZU_ZA),
];
