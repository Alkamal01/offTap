import { hausaNumber } from "./numbers.js";

export const say = {
  welcome: "Barka da zuwa offTap. Bayan karar, fadi abin da kake so. Misali: tura dubu biyar zuwa Musa.",
  noWallet: (ussdCode: string) => `Ba ka da offTap wallet. Danna ${ussdCode} don budewa.`,
  locked: "An kulle asusunka na awa daya saboda kuskuren PIN.",
  notUnderstood: "Ban gane ba. Fadi misali: tura dubu biyar zuwa Musa. Ko kuma: duba balance.",
  askRecipient: "Wa za a tura wa kudin? Fadi sunan da ka ajiye.",
  unknownContact: "Ban sami wannan sunan a cikin lambobinka ba. Sake fadin sunan.",
  askAmount: (name: string) => `Nawa za a tura wa ${name}?`,
  confirm: (ngn: number, name: string) =>
    `Za ka tura naira ${hausaNumber(ngn)} zuwa ${name}. Idan haka ne, shigar da PIN dinka sannan ka danna hash. Idan ba haka ba, kashe wayar.`,
  askPin: "Shigar da PIN dinka sannan ka danna hash.",
  wrongPin: (left: number) => `PIN ba daidai ba ne. Saura gwaji ${hausaNumber(left)}. Sake shigar da PIN dinka.`,
  sending: "Ana tura kudin. Za ka samu sakon SMS idan an gama. Na gode.",
  balance: (sats: number, ngn: number) => `Kana da sats ${hausaNumber(sats)}, kimanin naira ${hausaNumber(ngn)}. Na gode.`,
  balanceFailed: "Ba a iya duba balance ba yanzu. Sake gwadawa.",
  notRegistered: "Wannan mutumin ba shi da offTap wallet.",
  tooLarge: "Adadin ya wuce iyakar biya daya.",
  dailyLimit: "Ka kai iyakar kashe kudi na yau.",
  giveUp: (ussdCode: string) => `Yi hakuri, ban gane ba. Danna ${ussdCode} don amfani da menu.`,
  error: "An samu matsala. Sake gwadawa.",
};
