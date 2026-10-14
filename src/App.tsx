import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Hero } from './components/Hero';
import { HomeProducts } from './components/HomeProducts';
import { CastagnaLanding } from './components/CastagnaLanding';
import { About } from './components/About';
import { Benefits } from './components/Benefits';
import { Layout } from './components/Layout';
import { CartProvider } from './context/CartContext';
import { ProductProvider } from './context/ProductContext';
import { UIProvider } from './context/UIContext';

// Route-level code splitting: customers never download the admin panel.
const FeaturedProducts = lazy(() => import('./components/FeaturedProducts').then((m) => ({ default: m.FeaturedProducts })));
const Checkout = lazy(() => import('./components/Checkout').then((m) => ({ default: m.Checkout })));
const CheckoutResult = lazy(() => import('./components/CheckoutResult').then((m) => ({ default: m.CheckoutResult })));
const AdminPanel = lazy(() => import('./components/AdminPanel').then((m) => ({ default: m.AdminPanel })));

const Fallback = () => (
  <div className="min-h-[60vh] flex items-center justify-center">
    <div className="w-8 h-8 border-2 border-neutral-200 border-t-neutral-900 rounded-full animate-spin" />
  </div>
);

function Storefront() {
  return (
    <Layout>
      <Hero />
      <CastagnaLanding />
      <HomeProducts />
      <About />
      <Benefits />
    </Layout>
  );
}

export default function App() {
  return (
    <Router>
      <ProductProvider>
        <CartProvider>
          <UIProvider>
            <div className="min-h-screen flex flex-col bg-white">
              <Suspense fallback={<Fallback />}>
                <Routes>
                  <Route path="/" element={<Storefront />} />
                  <Route path="/coleccion" element={<Layout><FeaturedProducts /></Layout>} />
                  <Route path="/checkout" element={<Layout minimal><Checkout /></Layout>} />
                  <Route path="/checkout/result" element={<Layout minimal><CheckoutResult /></Layout>} />
                  <Route path="/admin" element={<AdminPanel />} />
                  <Route path="*" element={<Storefront />} />
                </Routes>
              </Suspense>
            </div>
          </UIProvider>
        </CartProvider>
      </ProductProvider>
    </Router>
  );
}
