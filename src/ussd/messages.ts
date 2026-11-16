const n = (value: number) => Math.round(value).toLocaleString("en-NG");

export const msg = {
  menu: "offTap\n1. Tura Kudi (Send)\n2. Duba Balance\n3. Karbi Kudi (Receive)\n4. Saita Wallet (Link)",
  menuUnlinked: "Barka da zuwa offTap.\nBa a hada wallet dinka ba.\n1. Hada wallet (Link wallet)",
  askRecipient: "Shigar da lambar waya ko Lightning address na mai karba:",
  askAmount: "Shigar da adadin kudi a Naira:",
  confirm: (ngn: number, sats: number, recipient: string) =>
    `Za ka tura N${n(ngn)} (${n(sats)} sats) zuwa ${recipient}.\nShigar da PIN dinka don tabbatarwa:`,
  sending: "Ana tura kudin. Za ka samu SMS idan an gama.",
  askPin: "Shigar da PIN dinka:",
  wrongPin: (left: number) => `PIN ba daidai ba ne. Saura gwaji ${left}.`,
  locked: "An kulle asusunka na awa 1 saboda kuskuren PIN.",
  balance: (sats: number, ngn: number) => `Balance: ${n(sats)} sats (kimanin N${n(ngn)})`,
  balanceLater: "Ana duba balance. Za mu turo maka SMS.",
  balanceFailed: "Ba a iya duba balance ba. Sake gwadawa.",
  receive: (address: string) => `Adireshinka na karbar kudi:\n${address}\nKo a tura zuwa lambar wayarka.`,
  noReceive: "Ba ka saita adireshin karbar kudi ba. Danna 4 don sake hada wallet.",
  linkCode: (code: string, url: string) =>
    `Lambar hadawa: ${code}\nBude ${url} ka shigar da ita. Za ta kare cikin minti 15.`,
  invalidRecipient: "Ba a gane mai karba ba. Duba lambar ko adireshin.",
  recipientNotRegistered: "Wannan lambar ba ta da offTap wallet.",
  invalidAmount: "Adadin kudi bai dace ba.",
  tooLarge: (maxSats: number) => `Adadin ya wuce iyaka (${n(maxSats)} sats a kowane biya).`,
  dailyLimit: "Ka kai iyakar kashe kudi na yau.",
  invalidChoice: "Zabi bai dace ba.",
  sessionExpired: "Lokaci ya kure. Sake farawa.",
  error: "An samu matsala. Sake gwadawa.",

  smsLinkCode: (code: string, url: string) => `offTap: Lambar hadawa ${code}. Bude ${url}. Kar ka ba kowa wannan lambar.`,
  smsLinked: (ussdCode: string) => `offTap: An hada wallet dinka. Danna ${ussdCode} don fara amfani.`,
  smsPaid: (ngn: number, sats: number, recipient: string, feeSats: number) =>
    `offTap: An tura N${n(ngn)} (${n(sats)} sats) zuwa ${recipient}. Kudin aiki: ${n(feeSats)} sats.`,
  smsReceived: (ngn: number, sats: number, sender: string) =>
    `offTap: Ka karbi N${n(ngn)} (${n(sats)} sats) daga ${sender}.`,
  smsFailed: (ngn: number, recipient: string, reason: string) =>
    `offTap: Ba a iya tura N${n(ngn)} zuwa ${recipient} ba. ${reason}`,
  smsBalance: (sats: number, ngn: number) => `offTap: Balance ${n(sats)} sats (kimanin N${n(ngn)}).`,
  reasonInsufficient: "Kudin wallet bai isa ba.",
  reasonBudget: "Ka wuce iyakar da ka saita a wallet dinka.",
  reasonGeneric: "Sake gwadawa daga baya.",
};
