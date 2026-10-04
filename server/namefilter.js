const LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '6': 'g', '7': 't', '8': 'b', '9': 'g', '@': 'a', '$': 's', '!': 'i', '+': 't', '€': 'e' };

// Matched anywhere inside the name, since nothing normal contains them
const COMPACT = [
  'nigger', 'nigga', 'niglet', 'nignog', 'niggo', 'nibba', 'nikka', 'kneegrow', 'wigger',
  'faggot', 'phag', 'kike', 'chink', 'gook', 'wop', 'gypo',
  'wetback', 'beaner', 'darky', 'darkie', 'tranny', 'shemale', 'retard',
  'porchmonkey', 'towelhead', 'raghead', 'zipperhead', 'golliwog', 'pajeet',
  'jigaboo', 'pickaninny', 'picaninny', 'tarbaby', 'mulignan', 'redskin', 'injun', 'cameljockey', 'chingchong',
  'hitler', 'mussolini', 'swastika', 'klan', 'taliban',
  'paneleiro', 'maricas', 'panasca', 'maricon', 'sudaca', 'sudaka', 'traveco', 'viadinho',
];

// Whole words only: these live inside normal names and words (Pakistan, Maine Coon, honky-tonk, Fagundes, Nazir)
const WORDS = ['jap', 'spic', 'spick', 'coon', 'sambo', 'dago', 'honky', 'gyp', 'paki', 'kraut', 'heeb', 'squaw', 'fenian', 'nazi', 'dyke', 'bicha', 'viado', 'nig', 'wog', 'pikey', 'fag'];

// Exact whole name or token: kkk lets kkkk (Brazilian laughter) through, lesbo spares the island of Lesbos
const EXACT = ['kkk', 'lesbo'];

const flex = (word) => [...word].map((c) => `${c}+`).join('');
const compactRe = COMPACT.map((w) => new RegExp(flex(w)));
const wordRe = WORDS.map((w) => new RegExp(`^${flex(w)}s*$`));
const exactSet = new Set(EXACT);

const fold = (name) =>
  String(name)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[013456789@$!+€]/g, (c) => LEET[c]);

const nameBlocked = (name) => {
  const folded = fold(name);
  const compact = folded.replace(/[^a-z]/g, '');
  if (!compact) return false;
  if (exactSet.has(compact)) return true;
  if (compactRe.some((re) => re.test(compact))) return true;
  if (wordRe.some((re) => re.test(compact))) return true;
  return folded.split(/[^a-z]+/).some((token) => exactSet.has(token) || wordRe.some((re) => re.test(token)));
};

module.exports = { nameBlocked };
