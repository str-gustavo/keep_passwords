import { installChromeMock } from './helpers/chrome-mock';

// A fresh in-memory `chrome` for every test file. Tests needing isolation between cases call
// resetChromeMock() in their own beforeEach (it also drops listeners registered at import time).
installChromeMock();
