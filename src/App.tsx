import { Route, Routes } from 'react-router-dom';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { Home } from './pages/Home';
import { Results } from './pages/Results';
import { Detail } from './pages/Detail';
import { Pools } from './pages/Pools';
import { NewPool } from './pages/NewPool';
import { PoolDetail } from './pages/PoolDetail';

/** App shell and routes. */
export default function App() {
  return (
    <>
      <Header />
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/search" element={<Results />} />
          <Route path="/property/:id" element={<Detail />} />
          <Route path="/pools" element={<Pools />} />
          <Route path="/pools/new" element={<NewPool />} />
          <Route path="/pools/:id" element={<PoolDetail />} />
          <Route path="*" element={<div className="container section"><h1>Page not found</h1></div>} />
        </Routes>
      </main>
      <Footer />
    </>
  );
}
