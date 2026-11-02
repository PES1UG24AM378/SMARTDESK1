import './globals.css';
import NavBar from '@/components/NavBar.js';

export const metadata = {
  title: 'SmartDesk - Semantic IT & Facilities Helpdesk',
  description: 'Helpdesk that finds similar solved problems, routes tickets and tracks SLAs.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <NavBar />
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
