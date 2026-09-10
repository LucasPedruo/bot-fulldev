// WhatsApp exposes no "this account is a bot" flag, so the closest thing to a real signal we have
// is whether the number itself looks like a phone a human could actually be reached on. Everything
// here is a format check against E.164 plus the Brazilian numbering plan - it filters out junk,
// spoofed and non-geographic (toll-free/satellite/premium) ranges, which is where automated
// accounts overwhelmingly live, but it can never prove the human on the other end exists.

// Assigned ITU-T E.164 country calling codes, restricted to *geographic* assignments. The
// deliberately excluded ranges (800/808 toll-free, 870/878 satellite and inmarsat, 881/882/883
// global mobile and networks, 888 disaster relief, 979 international premium rate) are never a
// personal mobile line, so a join request coming from one is treated as not-a-real-person.
const countryCallingCodes = new Set([
  "1",
  "7",
  "20",
  "27",
  "30",
  "31",
  "32",
  "33",
  "34",
  "36",
  "39",
  "40",
  "41",
  "43",
  "44",
  "45",
  "46",
  "47",
  "48",
  "49",
  "51",
  "52",
  "53",
  "54",
  "55",
  "56",
  "57",
  "58",
  "60",
  "61",
  "62",
  "63",
  "64",
  "65",
  "66",
  "81",
  "82",
  "84",
  "86",
  "90",
  "91",
  "92",
  "93",
  "94",
  "95",
  "98",
  "211",
  "212",
  "213",
  "216",
  "218",
  "220",
  "221",
  "222",
  "223",
  "224",
  "225",
  "226",
  "227",
  "228",
  "229",
  "230",
  "231",
  "232",
  "233",
  "234",
  "235",
  "236",
  "237",
  "238",
  "239",
  "240",
  "241",
  "242",
  "243",
  "244",
  "245",
  "246",
  "248",
  "249",
  "250",
  "251",
  "252",
  "253",
  "254",
  "255",
  "256",
  "257",
  "258",
  "260",
  "261",
  "262",
  "263",
  "264",
  "265",
  "266",
  "267",
  "268",
  "269",
  "290",
  "291",
  "297",
  "298",
  "299",
  "350",
  "351",
  "352",
  "353",
  "354",
  "355",
  "356",
  "357",
  "358",
  "359",
  "370",
  "371",
  "372",
  "373",
  "374",
  "375",
  "376",
  "377",
  "378",
  "380",
  "381",
  "382",
  "383",
  "385",
  "386",
  "387",
  "389",
  "420",
  "421",
  "423",
  "500",
  "501",
  "502",
  "503",
  "504",
  "505",
  "506",
  "507",
  "508",
  "509",
  "590",
  "591",
  "592",
  "593",
  "594",
  "595",
  "596",
  "597",
  "598",
  "599",
  "670",
  "672",
  "673",
  "674",
  "675",
  "676",
  "677",
  "678",
  "679",
  "680",
  "681",
  "682",
  "683",
  "685",
  "686",
  "687",
  "688",
  "689",
  "690",
  "691",
  "692",
  "850",
  "852",
  "853",
  "855",
  "856",
  "880",
  "886",
  "960",
  "961",
  "962",
  "963",
  "964",
  "965",
  "966",
  "967",
  "968",
  "970",
  "971",
  "972",
  "973",
  "974",
  "975",
  "976",
  "977",
  "992",
  "993",
  "994",
  "995",
  "996",
  "998"
]);

// Area codes (DDD) actually allocated in Brazil - the gaps (20, 23, 25, 26, 29, 30, 36, 39, 40,
// 50, 52, 56, 57, 58, 59, 60, 70, 72, 76, 78, 80, 90) are unassigned, so a +55 number carrying one
// cannot be a real line.
const brazilianAreaCodes = new Set([
  "11",
  "12",
  "13",
  "14",
  "15",
  "16",
  "17",
  "18",
  "19",
  "21",
  "22",
  "24",
  "27",
  "28",
  "31",
  "32",
  "33",
  "34",
  "35",
  "37",
  "38",
  "41",
  "42",
  "43",
  "44",
  "45",
  "46",
  "47",
  "48",
  "49",
  "51",
  "53",
  "54",
  "55",
  "61",
  "62",
  "63",
  "64",
  "65",
  "66",
  "67",
  "68",
  "69",
  "71",
  "73",
  "74",
  "75",
  "77",
  "79",
  "81",
  "82",
  "83",
  "84",
  "85",
  "86",
  "87",
  "88",
  "89",
  "91",
  "92",
  "93",
  "94",
  "95",
  "96",
  "97",
  "98",
  "99"
]);

// A JID looks like "5511999999999@s.whatsapp.net", sometimes carrying a ":<device>" suffix
// ("5511999999999:12@s.whatsapp.net"). Anything that is not a bare run of digits (most notably a
// "...@lid" identity, which is an opaque internal id rather than a phone number) yields undefined.
export function extractPhoneNumber(jid: string): string | undefined {
  const user = jid.split("@")[0].split(":")[0];
  return /^\d+$/.test(user) ? user : undefined;
}

export function isLikelyRealPhoneNumber(jid: string): boolean {
  // A LID can never be validated: it carries no country code and no national number, so there is
  // nothing to check against a numbering plan. Callers are expected to resolve it to its
  // phone-number form first; if that failed, we err on the side of not auto-approving.
  if (jid.includes("@") && !jid.endsWith("@s.whatsapp.net")) {
    return false;
  }

  const digits = extractPhoneNumber(jid);

  // E.164 caps a full international number at 15 digits. The floor of 8 is the shortest plausible
  // country code + subscriber number combination still in service anywhere.
  if (!digits || digits.length < 8 || digits.length > 15) {
    return false;
  }

  const countryCode = matchCountryCallingCode(digits);
  if (!countryCode) {
    return false;
  }

  if (countryCode === "55") {
    return isValidBrazilianNumber(digits.slice(2));
  }

  // Outside Brazil we only know the country code is real and the overall length is sane - national
  // numbering plans differ too much to validate without a full libphonenumber-sized dataset.
  return digits.length - countryCode.length >= 5;
}

// Calling codes are a prefix code, but only when matched longest-first: "1" (NANP) is a valid code
// and so is "1" as the start of nothing else, while "55" (Brazil) must not be read as "5".
function matchCountryCallingCode(digits: string): string | undefined {
  for (const length of [3, 2, 1]) {
    const candidate = digits.slice(0, length);
    if (countryCallingCodes.has(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

// After the +55, a Brazilian number is a 2-digit area code followed by the subscriber number:
//
//   9 digits, starting with 9  -> mobile in the current national plan
//   8 digits, starting with 6-9 -> mobile in the pre-2016 plan
//   8 digits, starting with 2-5 -> landline
//
// The 8-digit mobile case is not a historical curiosity: WhatsApp stores plenty of Brazilian
// accounts without the ninth digit, so their JID arrives in the legacy form. Rejecting it left
// real people (e.g. 55 79 9147-2437, seen in production) stuck pending forever.
function isValidBrazilianNumber(national: string): boolean {
  const areaCode = national.slice(0, 2);
  const subscriber = national.slice(2);

  if (!brazilianAreaCodes.has(areaCode)) {
    return false;
  }

  if (subscriber.length === 9) {
    return subscriber.startsWith("9");
  }

  if (subscriber.length === 8) {
    return /^[2-9]/.test(subscriber);
  }

  return false;
}
