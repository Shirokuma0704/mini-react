// Browser entry point. Tests import src/app.js and call mountApp on a jsdom document instead.
import { mountApp } from './app.js';

mountApp(document);
