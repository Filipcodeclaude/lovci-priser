// Všechny texty a čísla hry na jednom místě.

export const REGIONS = {
  camp: { name: 'Tábor', x: 0, z: 40 },
  jungle: { name: 'Šeptající džungle', x: -130, z: -80 },
  coast: { name: 'Větrné pobřeží', x: 150, z: 110 },
  swamp: { name: 'Tichý močál', x: -110, z: 150 },
  rocks: { name: 'Hromové údolí', x: 120, z: -130 },
};

export const MATS = {
  trn: 'Trn',
  usen: 'Useň z Trnovce',
  supina: 'Bahenní šupina',
  pero: 'Bouřné pero',
  list: 'Léčivý list',
  vlakno: 'Vlákno z lián',
  plod: 'Sladký plod',
  kamen: 'Kámen',
  ruda: 'Jiskřivá ruda',
  musle: 'Mušle',
  hliza: 'Bahenní hlíza',
};

export const ITEMS = {
  obklad: { n: 'Léčivý obklad', max: 5, d: 'Vrátí ti kus zdraví. Chvíli to trvá, tak ho nedávej přímo pod tlamou.' },
  past: { n: 'Smyčková past', max: 3, d: 'Položíš ji na zem. Příšera, která do ní šlápne, se pár vteřin nehne.' },
  navnada: { n: 'Návnada', max: 3, d: 'Voňavá hrouda z plodů. Příšery z okolí za ní přijdou a tebe si nevšímají.' },
  traskavka: { n: 'Třaskavka', max: 3, d: 'Hlasitá rána se zábleskem. Vyplaší stádo a srazí letce na zem.' },
};
export const ITEM_ORDER = ['obklad', 'past', 'navnada', 'traskavka'];

export const WEAPONS = {
  tesak: { n: 'Starý tesák', d: 'Obyčejná vyvážená zbraň. Nic neumí nejlíp, ale nic jí nechybí.', light: 12, heavy: 27, spd: 1, move: 1, range: 2.7 },
  cepel: { n: 'Trnová čepel', d: 'Lehká. Sekáš rychle a líp se s ní běhá, jen rány jsou slabší.', light: 10, heavy: 21, spd: 0.72, move: 1.12, range: 2.6 },
  palice: { n: 'Bahenní palice', d: 'Těžká. Každá rána pořádně bolí, ale máchnutí trvá a běháš pomaleji.', light: 21, heavy: 50, spd: 1.45, move: 0.88, range: 3.1 },
  kopi: { n: 'Bouřné kopí', d: 'Dlouhý dosah. Silný útok příšeru na chvíli ochromí.', light: 16, heavy: 36, spd: 0.95, move: 1, range: 3.8, stun: true },
};

export const ARMORS = {
  kazajka: { n: 'Plátěná kazajka', d: 'Moc toho nevydrží, ale nepřekáží.', hp: 100, def: 1, stealth: 1, regen: 1, col: 0x3d5a3a },
  vesta: { n: 'Trnová vesta', d: 'Vydržíš víc ran.', hp: 135, def: 0.85, stealth: 1, regen: 1, col: 0x8a5a2a },
  plast: { n: 'Bahenní plášť', d: 'Příšery si tě všimnou později a bahno tě nezpomalí.', hp: 115, def: 0.95, stealth: 0.7, regen: 1, mud: true, col: 0x4a4a30 },
  zbroj: { n: 'Bouřná zbroj', d: 'Vydrží hodně a výdrž se ti vrací rychleji.', hp: 165, def: 0.72, stealth: 1, regen: 1.5, col: 0x2f3f73 },
};

// unlock: null = od začátku, jinak id úkolu, po kterém se recept objeví
export const RECIPES = [
  { id: 'obklad', type: 'item', cost: { list: 2 }, unlock: null },
  { id: 'past', type: 'item', cost: { vlakno: 3, kamen: 1 }, unlock: 'q1' },
  { id: 'navnada', type: 'item', cost: { plod: 2 }, unlock: 'q1' },
  { id: 'traskavka', type: 'item', cost: { musle: 2, ruda: 1 }, unlock: 'q3' },
  { id: 'cepel', type: 'weapon', cost: { trn: 3, vlakno: 2 }, unlock: 'q2' },
  { id: 'palice', type: 'weapon', cost: { supina: 2, kamen: 4, vlakno: 2 }, unlock: 'q3' },
  { id: 'kopi', type: 'weapon', cost: { pero: 2, trn: 2, ruda: 3 }, unlock: 'q6' },
  { id: 'vesta', type: 'armor', cost: { usen: 2, trn: 2 }, unlock: 'q2' },
  { id: 'plast', type: 'armor', cost: { supina: 2, hliza: 3, vlakno: 2 }, unlock: 'q4' },
  { id: 'zbroj', type: 'armor', cost: { pero: 2, supina: 2, ruda: 3 }, unlock: 'q6' },
  { id: 'brousek', type: 'upgrade', cost: { kamen: 3, ruda: 2 }, unlock: 'q5' },
];

export const BEASTS = {
  trnovec: {
    name: 'Trnovec', unknown: 'Neznámý kopytník',
    notes: [
      { need: 1, t: 'Býložravec velký asi jako kůň, na hřbetě má řady tvrdých trnů. Chodí v malých stádech a celý den se pase.' },
      { need: 3, t: 'Je plachý. Jakmile tě ucítí, celé stádo uteče. V noci stádo leží pohromadě a spí, za deště se stahuje pod stromy. Když ho ale zaženeš do kouta nebo ho uhodíš, skloní hlavu, hrábne kopytem a rozběhne se přímo na tebe.' },
      { need: 5, t: 'SLABINA: Do zad ho nemá cenu mlátit, trny ránu odrazí. Uhni jeho výpadu do strany. Po rozběhu chvíli jen stojí a funí, a když nabourá do stromu nebo skály, je úplně omráčený. Tehdy bij.' },
    ],
  },
  bahnak: {
    name: 'Bahňák', unknown: 'Něco velkého v bahně',
    notes: [
      { need: 1, t: 'Těžký dravec z močálu, široká tlama a oči navrchu hlavy. Za sebou táhne ocas, takže mezi otisky bývá rýha.' },
      { need: 3, t: 'Přes den leží zahrabaný v bahně, vidět jsou jen oči a bubliny. Čeká, až něco půjde kolem, a pak vyrazí. V noci a za deště z bahna vylézá a loví slípky. Než kousne, zakloní hlavu. Než švihne ocasem, stočí ho k tělu. Když plive bahno, nafoukne tváře.' },
      { need: 5, t: 'SLABINA: Potřebuje mokro. Když ho vylákáš na suchou zem, kůže mu začne vysychat, zpomalí a rány ho bolí víc. Po výpadu má navíc chvíli odkryté břicho.' },
    ],
  },
  dravec: {
    name: 'Bouřný dravec', unknown: 'Stín na obloze',
    notes: [
      { need: 1, t: 'Obrovský létající dravec. Na hrudi mu svítí modrý krystal a ztrácí dlouhá tmavomodrá pera.' },
      { need: 3, t: 'Přes den spí na hnízdě vysoko v Hromovém údolí. Vzlétá v noci a za bouřky a vidí tě z veliké dálky. Před střemhlavým útokem zakřičí a na chvíli zůstane viset ve vzduchu. Za bouřky umí přivolat blesk, na zemi se před ním objeví světelný kruh.' },
      { need: 5, t: 'SLABINA: Ve vzduchu na něj nedosáhneš. Po střemhlavém útoku ale pár vteřin sedí na zemi, a to je tvoje chvíle. Třaskavka ho ze vzduchu srazí úplně. Když ho najdeš ve dne spícího na hnízdě, první rána bude bolet dvojnásob.' },
    ],
  },
};

export const TRACK_TEXT = {
  trnovec: {
    print: 'Otisk kopyta se třemi prsty. Zvíře velké asi jako kůň, našlapuje zlehka',
    scratch: 'Kůra je sedřená ve výšce pasu. Něco si tu drbalo trnitý hřbet',
    food: 'Ohryzané plody a okousané kapradí. Tady se někdo pásl',
  },
  bahnak: {
    print: 'Široká tlapa s blánou mezi prsty, hluboko zabořená. Hodně těžký tvor',
    drag: 'Dlouhá rýha v blátě, jako by někdo táhl kládu. Vlečený ocas',
    food: 'Rozkousané skořápky a pár peříček slípky. Někdo tu jedl',
  },
  dravec: {
    feather: 'Tmavomodré pero delší než tvoje paže. Na dotek brní',
    print: 'Otisk pařátu se čtyřmi drápy, velký jako talíř',
    scratch: 'Hluboké rýhy ve skále. Tady něco dosedlo',
  },
};

export const OBSERVE = {
  trnovec: ['Trnovci se pasou s hlavou u země. Jeden vždycky hlídá.', 'Jeden z Trnovců se otírá hřbetem o strom. Trny má tvrdé jako kámen.', 'Když Trnovec zvedne hlavu a odfrkne, celé stádo ztuhne.'],
  bahnak: ['Z bahna koukají jen dvě žluté oči. Skoro se nehýbou.', 'Kolem Bahňáka stoupají bubliny. Dýchá pod hladinou.', 'Na suchou zem leze nerad a hned se vrací do mokra.'],
  dravec: ['Dravec krouží pořád ve stejném kruhu nad údolím.', 'Krystal na jeho hrudi se před bleskem rozzáří.', 'Po každém střemhlavém útoku chvíli zůstane sedět na zemi.'],
};

export const QUESTS = [
  {
    id: 'q1', title: 'První stopy', region: 'jungle',
    brief: '„Než vezmeš zbraň do ruky, nauč se číst zem. V džungli na severozápadě se pase stádo Trnovců. Najdi jejich stopy a dojdi po nich až ke stádu. Bojovat nemusíš, jen se dívej.“',
    reward: { mats: { vlakno: 4, list: 3, plod: 2, kamen: 1 }, unlock: 'coast', text: 'Radovan ti ukázal stezku na Větrné pobřeží a naučil tě plést pasti a hníst návnadu.' },
  },
  {
    id: 'q2', title: 'Trny pro dílnu', region: 'jungle',
    brief: '„V dílně došly trny a bez nich pořádnou čepel neuděláš. Ulov jednoho Trnovce, nebo ho aspoň zažeň, ať nějaké ztratí. Přines mi dva. Past ti pomůže, zkus ji.“',
    reward: { mats: { list: 2, kamen: 2 }, unlock: 'swamp', text: 'Otevřela se cesta do Tichého močálu. V dílně teď umíš Trnovou čepel a Trnovou vestu.' },
  },
  {
    id: 'q3', title: 'Pramen v močálu', region: 'swamp',
    brief: '„U pramene v močálu si ustlal Bahňák a k vodě se nedá jít. Najdi jeho stopy, ať víš, s kým máš tu čest, a pak ho od pramene dostaň. Odlákej ho návnadou, zažeň ho, nebo se s ním poper. Je to na tobě.“',
    reward: { mats: { musle: 2, plod: 2, list: 2 }, unlock: 'rocks', text: 'Pramen je volný. Radovan ti otevřel stezku do Hromového údolí a v dílně přibyla Bahenní palice a Třaskavka.' },
  },
  {
    id: 'q4', title: 'Lov v dešti', region: 'swamp',
    brief: '„Za deště a v mlze Bahňák vylézá z bahna a loví. Tehdy je nejnebezpečnější, ale taky ho konečně pořádně uvidíš. Počkej si na déšť, mlhu nebo bouřku a pak ho poraz nebo zažeň.“',
    reward: { mats: { hliza: 2, ruda: 1 }, text: 'Radovan ti ukázal, jak z šupin ušít Bahenní plášť.' },
  },
  {
    id: 'q5', title: 'Starý samec', region: 'coast',
    brief: '„Na pobřeží chodí stádo, které vede starý samec. Je větší, tmavší a neutíká. Poraz ho v poctivém souboji, bez pastí. Chci vědět, že umíš uhýbat.“',
    reward: { mats: { kamen: 3, ruda: 2 }, text: 'Radovan ti půjčil svůj brousek. V dílně si teď můžeš nabrousit zbraň.' },
  },
  {
    id: 'q6', title: 'Bouřný dravec', region: 'rocks',
    brief: '„Tohle je poslední zkouška. Nad Hromovým údolím lítá Bouřný dravec. Uvidíš ho jen v noci nebo za bouřky, ve dne spí na hnízdě. Poraz ho nebo zažeň a přines mi jeho pero.“',
    reward: { mats: { ruda: 3 }, text: 'Radovan ti podal ruku. „Teď jsi lovec.“ V dílně přibylo Bouřné kopí a Bouřná zbroj. Ostrov žije dál a lovit můžeš, jak chceš.' },
  },
];

export const WEATHER_NAME = { clear: 'jasno', rain: 'déšť', fog: 'mlha', storm: 'bouřka' };

export const CONTROLS = [
  ['W A S D', 'pohyb'], ['Myš', 'kamera'], ['Levé tlačítko', 'útok'], ['Pravé tlačítko', 'silný útok'],
  ['Mezerník', 'úskok'], ['Shift', 'běh'], ['C', 'plížení'], ['E', 'akce (sebrat, prozkoumat)'],
  ['Q', 'použít předmět'], ['1 2 3 4', 'výběr předmětu'], ['R', 'zaměřit příšeru'], ['M', 'mapa'], ['J', 'deník'], ['Esc', 'menu'],
];
