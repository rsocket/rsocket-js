export default class Logger {
  static info(message, ...rest) {
    const date = new Date()
      .toISOString()
      .replace(/T/, " ") // replace T with a space
      .replace(/\..+/, ""); // delete the dot and everything after;
    return console.log(`[${date}] ${message}`, ...rest);
  }
}
