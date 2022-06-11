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

const numeric = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
// const numericChars = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
const alphabetNumeric = "abcdefghijklmnopqrstuvqxyz0123456789";

export const hex: any = {};

alphabetNumeric.split("").forEach((c) => {
  hex[c] = strHex(c);
});
