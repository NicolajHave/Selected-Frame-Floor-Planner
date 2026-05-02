import { customAlphabet } from 'nanoid';

const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
const make = customAlphabet(alphabet, 10);

export const newId = (prefix: string): string => `${prefix}_${make()}`;
