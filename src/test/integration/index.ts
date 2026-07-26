/**
 * Bundle entry for the integration suite. esbuild rolls this into `dist/test/suite.test.js`,
 * which is the single file mocha loads inside the extension host.
 */
import './extension.test';
