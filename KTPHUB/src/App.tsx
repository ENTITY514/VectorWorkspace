import { Routes, Route } from "react-router-dom";
import { Box } from "@mui/material";
import Header from "./components/Header/header";
import KtpEditorPage from "./pages/ktpEditorPage/page";
import KtpPage from "./pages/ktpPage/page";
import TupViewPage from "./pages/tupViewPage";
import SettingsPage from "./pages/settingsPage/page";
import GradeJournalPage from "./pages/gradeJournalPage/page";
import SorSochAnalysisLogPage from "./pages/sorSochAnalysisLogPage/page";
import TitlePageGeneratorPage from "./pages/titlePage/page";
import ExplanatoryNotePage from "./pages/explanatoryNotePage/page";
import LoginPage from "./pages/loginPage/page";
import RegisterPage from "./pages/registerPage/page";
import AdminTupPage from "./pages/adminTupPage/page";
import TupCatalogPage from "./pages/tupCatalogPage/page";
import KtpCatalogPage from "./pages/ktpCatalogPage/page";
import { RequireAuth } from "./features/RequireAuth";

function App() {
  return (
    <>
      <Header />
      <Box component="main" sx={{ p: 3 }}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          <Route path="/" element={<KtpPage />} />
          <Route path="/ktp" element={<KtpPage />} />
          <Route
            path="/tup-catalog"
            element={
              <RequireAuth>
                <TupCatalogPage />
              </RequireAuth>
            }
          />
          <Route
            path="/ktp-catalog"
            element={
              <RequireAuth>
                <KtpCatalogPage />
              </RequireAuth>
            }
          />
          <Route
            path="/admin/tup"
            element={
              <RequireAuth adminOnly>
                <AdminTupPage />
              </RequireAuth>
            }
          />

          <Route path="/title-page" element={<TitlePageGeneratorPage />} />
          <Route path="/explanatory-note" element={<ExplanatoryNotePage />} />
          <Route path="/grade-journal" element={<GradeJournalPage />} />
          <Route path="/sor-soch-logger" element={<SorSochAnalysisLogPage />} />
          <Route path="/tup-view/:tupId" element={<TupViewPage />} />
          <Route path="/ktp-editor/:ktpId" element={<KtpEditorPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </Box>
    </>
  );
}

export default App;
