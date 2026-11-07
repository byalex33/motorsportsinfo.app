// FIA Document titles, shared by the server and the browser. A title such as "Infringement – Car 27 –
// Impeding of Car 55" is a spoiler: the list hides its car numbers until clicked (see Spoiler).

/** A car number in a title, captured so split() keeps each one at the odd indexes. */
export const CAR_NUMBER = /(\bCar \d+\b)/i;
