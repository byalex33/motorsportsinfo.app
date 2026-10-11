// FIA Document titles, shared by the server and the browser. A title such as "Infringement – Car 27 –
// Impeding of Car 55" is a spoiler: the list hides its car numbers until clicked (see Spoiler).

/** A car number in a title, captured so split() keeps each one at the odd indexes. */
export const CAR_NUMBER = /(\bCar \d+\b)/i;

/**
 * The title with its car numbers hidden ("Infringement – Car # – Impeding of Car #"), for the places a
 * viewer can't choose to reveal them: the browser tab and history, and the card a shared link unfurls into.
 */
export function hideCarNumbers(title: string): string {
  return title.replace(/\bCar \d+\b/gi, "Car #");
}

/** A readable title from the file name alone: "2026_baku_event_-_entry_list.pdf" → "Baku event – entry list". */
export function titleFromFile(file: string): string {
  const words = file
    .replace(/\.pdf$/i, "")
    .replace(/^\d{4}_/, "")
    .replace(/_-_/g, " – ")
    .replace(/_/g, " ")
    .trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
