// Storefront reads the same catalog the checkout function uses, so a product and
// its buyability never drift between the page and the server.
import { PRODUCTS } from '../../functions/lib/catalog.js';

export default PRODUCTS;
