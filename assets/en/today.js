// assets/en/today.js
// Pure: today's date in the lesson's written form ("Wednesday, November 11th") and spoken form ("… the eleventh"),
// for the one dynamic lesson item ("What day is it today?").
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const UNITS = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth',
    'thirteenth', 'fourteenth', 'fifteenth', 'sixteenth', 'seventeenth', 'eighteenth', 'nineteenth'];

export function ordinalSuffix(n) {
    if (n % 100 >= 11 && n % 100 <= 13) return 'th';
    return ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
}

export function ordinalWord(n) {
    if (n < 20) return UNITS[n];
    if (n === 20) return 'twentieth';
    if (n === 30) return 'thirtieth';
    return `${n < 30 ? 'twenty' : 'thirty'}-${UNITS[n % 10]}`;
}

export const formatDate = (d) => `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}${ordinalSuffix(d.getDate())}`;
export const spokenDate = (d) => `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} the ${ordinalWord(d.getDate())}`;

// A lesson item as played now: the dynamic "today" item gets its answers from the device date.
export function resolveItem(item, now = new Date()) {
    if (item.dynamic !== 'today') return item;
    const date = formatDate(now);
    return { ...item, en: [`Today is ${date}.`, `Today is ${date}`, date], hear: `Today is ${spokenDate(now)}.` };
}
