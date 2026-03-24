(function initSelectors(globalScope) {
  const root = globalScope.AvtoFair = globalScope.AvtoFair || {};

  root.Selectors = {
    listingUrlPattern: /\/Ads\/details\.asp/i,
    resultsUrlPattern: /\/Ads\/results\.asp/i,
    avtoFairRootSelector: "[data-avtofair-root]",
    titleSelectors: [
      "h1",
      "h2",
      "meta[property='og:title']",
      "[itemprop='name']",
      ".GO-Results-Naziv",
      "[class*='heading']"
    ],
    imageSelectors: [
      "meta[property='og:image']",
      "img[src*='images.avto.net/photo']"
    ],
    labelAliases: {
      year: ["leto proizvodnje", "prva registracija", "letnik", "1 registracija"],
      mileage: ["prevozeni km", "prevozenih", "prevozeni kilometri"],
      owners: ["lastnikov", "lastnik"],
      fuel: ["gorivo", "vrsta goriva"],
      power: ["moc motorja", "motor"],
      transmission: ["menjalnik"],
      bodyType: ["oblika", "karoserijska izvedba"],
      doors: ["st vrat", "st vrat.", "st vrat"],
      color: ["barva"],
      location: ["kraj ogleda", "lokacija"],
      drivetrain: ["pogon"],
      firstRegistration: ["prva registracija"],
      engine: ["motor"],
      sellerType: ["tip prodajalca", "prodajalec"],
      price: ["cena"],
      interior: ["notranjost"],
      technicalInspection: ["tehnicni pregled velja do"]
    },
    equipmentSectionTitles: [
      "oprema in ostali podatki o ponudbi",
      "oprema",
      "ostali podatki"
    ],
    descriptionStopTitles: [
      "cena",
      "prodajalec",
      "dodatne moznosti",
      "oglejte si tudi ponudbo",
      "kupujte varno",
      "najnovejsi oglasi",
      "ostali oglasi"
    ],
    listingRemovalPhrases: [
      "ni vec aktualna",
      "odstranjen iz ponudbe",
      "prislo je do napake",
      "ponudba ki je bila objavljena na iskani strani ni vec aktualna"
    ],
    ignoredTextPatterns: [
      /^objavi oglas$/i,
      /^parkirano$/i,
      /^moj\.avto\.net$/i,
      /^rubrike$/i,
      /^avto$/i,
      /^moto$/i,
      /^gospodarska/i,
      /^mehanizacija$/i,
      /^prosti cas$/i,
      /^deli in oprema$/i,
      /^registracija$/i,
      /^prijava v sistem$/i,
      /^o podjetju$/i,
      /^pomoc uporabnikom$/i,
      /^oglasevanje$/i,
      /^zaposlitev$/i,
      /^pravno obvestilo$/i,
      /^varstvo zasebnosti$/i,
      /^telefon:?$/i,
      /^poslji e-mail prodajalcu$/i,
      /^dodatne moznosti$/i,
      /^natisni ponudbo$/i,
      /^nazaj na prejsnjo stran$/i,
      /^prijava spornega oglasa$/i,
      /^parkiraj v moj\.avto\.net$/i
    ],
    widgetMountCandidates: [
      "h1",
      "h2",
      "[class*='naslov']",
      "[class*='heading']",
      "main"
    ],
    searchResultLinkSelector: "a[href*='Ads/details.asp?id='], a[href*='Ads/details.asp?ID=']",
    listingLinkSelector: "a[href*='prepare_results_makes.asp?'], a[href*='Ads/prepare_results_makes.asp?'], a[href*='znamka='][href*='model=']",

    mobileDe: {
      listingUrlPattern: /\/fahrzeuge\/details\.html|-ID-\d{6,}\.html/i,
      resultsUrlPattern: /\/fahrzeuge\/search\.html/i,
      searchResultLinkSelector: "a[href*='fahrzeuge/details.html']",
      makeIdLinkSelector: "a[href*='makeModelVariant1.makeId=']",
      listingRemovalPhrases: [
        "fahrzeug wurde bereits verkauft",
        "inserat existiert nicht mehr",
        "nicht mehr verfugbar",
        "inserat ist abgelaufen"
      ],
      labelAliases: {
        year: ["erstzulassung", "baujahr", "ez"],
        mileage: ["kilometerstand", "km-stand"],
        fuel: ["kraftstoffart", "kraftstoff"],
        power: ["leistung"],
        transmission: ["getriebe"],
        bodyType: ["karosserieform", "fahrzeugtyp"],
        color: ["aussenfarbe", "außenfarbe", "farbe"],
        doors: ["anzahl turen", "anzahl türen", "turen"],
        drivetrain: ["antriebsart", "antrieb"],
        owners: ["anzahl fahrzeughalter", "fahrzeughalter"],
        location: ["standort", "händlerstandort"],
        price: ["preis", "kaufpreis"]
      }
    }
  };
}(globalThis));
