declare module 'opening_hours' {
  export default class OpeningHours {
    constructor(value: string, nominatim?: unknown, options?: { mode?: number });
    getState(date?: Date): boolean;
    getUnknown(date?: Date): boolean;
    getNextChange(date?: Date, limit?: Date): Date | undefined;
    getComment(date?: Date): string | undefined;
  }
}
