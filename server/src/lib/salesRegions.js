// Groups a canonical country name (see countryNames.js's normalizeCountryName)
// into the sales-region vocabulary Universal Filters' own Geography filter
// already uses -- Lead.territory is free text staff type in by hand
// (e.g. "APAC", "Benelux", "Benelux / DACH", "Iberia"), so there's no fixed
// list to import from; this is that list, made explicit and extended to
// cover every country a cold-outreach contact could report. Without this,
// Outreach/DOE's Geography filter showed raw country names ("Germany",
// "India") while Universal Filters showed region names for the exact same
// concept, so the two screens looked like they disagreed about what
// "Geography" even means.
//
// "Benelux / DACH" in existing territory data is a merged label (whichever
// rep/team happens to cover both) rather than a real geographic region, so
// it's deliberately not reproduced here -- Benelux and DACH are kept as the
// two standard regions they actually are.
const REGION_COUNTRIES = {
  "North America": ["United States", "Canada"],
  "Latin America & Caribbean": [
    "Mexico", "Belize", "Costa Rica", "El Salvador", "Guatemala", "Honduras", "Nicaragua", "Panama",
    "Argentina", "Bolivia", "Brazil", "Chile", "Colombia", "Ecuador", "Guyana", "Paraguay", "Peru",
    "Suriname", "Uruguay", "Venezuela",
    "Antigua and Barbuda", "Bahamas", "Barbados", "Cuba", "Dominica", "Dominican Republic", "Grenada",
    "Haiti", "Jamaica", "Puerto Rico", "Saint Kitts and Nevis", "Saint Lucia",
    "Saint Vincent and the Grenadines", "Trinidad and Tobago"
  ],
  "UK & Ireland": ["United Kingdom", "Ireland"],
  DACH: ["Germany", "Austria", "Switzerland", "Liechtenstein"],
  Benelux: ["Netherlands", "Belgium", "Luxembourg"],
  Nordics: ["Sweden", "Norway", "Denmark", "Finland", "Iceland"],
  France: ["France", "Monaco"],
  Iberia: ["Spain", "Portugal", "Andorra"],
  "Southern Europe": ["Italy", "Greece", "Malta", "San Marino", "Vatican City", "Cyprus"],
  "Central & Eastern Europe": [
    "Poland", "Czech Republic", "Slovakia", "Hungary", "Romania", "Bulgaria", "Croatia", "Slovenia",
    "Serbia", "Bosnia and Herzegovina", "Montenegro", "North Macedonia", "Albania", "Kosovo",
    "Estonia", "Latvia", "Lithuania", "Moldova", "Ukraine", "Belarus", "Russia"
  ],
  "Middle East": [
    "United Arab Emirates", "Saudi Arabia", "Qatar", "Kuwait", "Bahrain", "Oman", "Israel", "Jordan",
    "Lebanon", "Iraq", "Iran", "Syria", "Yemen", "Palestine", "Turkey", "Georgia", "Armenia", "Azerbaijan"
  ],
  Africa: [
    "Algeria", "Angola", "Benin", "Botswana", "Burkina Faso", "Burundi", "Cameroon", "Cape Verde",
    "Central African Republic", "Chad", "Comoros", "Congo", "Democratic Republic of the Congo",
    "Djibouti", "Egypt", "Equatorial Guinea", "Eritrea", "Eswatini", "Ethiopia", "Gabon", "Gambia",
    "Ghana", "Guinea", "Guinea-Bissau", "Ivory Coast", "Kenya", "Lesotho", "Liberia", "Libya",
    "Madagascar", "Malawi", "Mali", "Mauritania", "Mauritius", "Morocco", "Mozambique", "Namibia",
    "Niger", "Nigeria", "Rwanda", "Sao Tome and Principe", "Senegal", "Seychelles", "Sierra Leone",
    "Somalia", "South Africa", "South Sudan", "Sudan", "Tanzania", "Togo", "Tunisia", "Uganda",
    "Zambia", "Zimbabwe"
  ],
  APAC: [
    "Afghanistan", "Australia", "Bangladesh", "Bhutan", "Brunei", "Cambodia", "China", "East Timor",
    "Fiji", "Hong Kong", "India", "Indonesia", "Japan", "Kazakhstan", "Kiribati", "Kyrgyzstan", "Laos",
    "Macau", "Malaysia", "Maldives", "Marshall Islands", "Micronesia", "Mongolia", "Myanmar", "Nauru",
    "Nepal", "New Zealand", "North Korea", "Pakistan", "Palau", "Papua New Guinea", "Philippines",
    "Samoa", "Singapore", "Solomon Islands", "South Korea", "Sri Lanka", "Taiwan", "Tajikistan",
    "Thailand", "Tonga", "Turkmenistan", "Tuvalu", "Uzbekistan", "Vanuatu", "Vietnam"
  ]
};

// The order Geography dropdowns list regions in — alphabetical would
// scatter closely-related ones (DACH/Benelux/Iberia) apart; this instead
// goes roughly by market size/proximity, matching how a deal team actually
// thinks about coverage.
export const SALES_REGIONS = Object.keys(REGION_COUNTRIES);

const COUNTRY_TO_REGION = new Map();
for (const [region, countries] of Object.entries(REGION_COUNTRIES)) {
  for (const country of countries) COUNTRY_TO_REGION.set(country, region);
}

// `country` must already be a canonical name (run it through
// normalizeCountryName first) -- this only knows the ~200 ISO-recognized
// countries that table produces, not arbitrary free text. Returns null for
// anything unmapped rather than guessing, same convention as
// normalizeCountryName's own null-for-empty.
export function regionForCountry(country) {
  if (!country) return null;
  return COUNTRY_TO_REGION.get(country) ?? null;
}
