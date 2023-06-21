function numHex(s) {
  let a = s.toString(16);
  if (a.length % 2 > 0) {
    a = "0" + a;
  }
  return a;
}

function strHex(s) {
  let a = "";
  for (let i = 0; i < s.length; i++) {
    a = a + numHex(s.charCodeAt(i));
  }

  return a;
}

const alphabetNumeric = "abcdefghijklmnopqrstuvqxyz0123456789";

export const hex: any = {};

alphabetNumeric.split("").forEach((c) => {
  hex[c] = strHex(c);
});
