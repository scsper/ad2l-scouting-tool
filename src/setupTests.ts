import "@testing-library/jest-dom/vitest"

/**
 * jsdom has no layout, so anything that moves the viewport is unimplemented and
 * throws rather than no-opping. The tab strip pulls its active tab into view on
 * mount, which is a real behaviour worth keeping — this stubs the environment
 * gap rather than making the component defensive about a browser API that
 * exists in every browser.
 */
Element.prototype.scrollIntoView = () => undefined
