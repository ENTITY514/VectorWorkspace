import React from "react";
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Box,
  IconButton,
} from "@mui/material";
import SchoolIcon from "@mui/icons-material/School";
import { Link as RouterLink } from "react-router-dom";
import { useTranslation } from "../../shared/lib/i18n";
import { LanguageSwitcher } from "../../features/LanguageSwitcher";
import { useAuth } from "../../entities/session";

const Header: React.FC = () => {
  const { t } = useTranslation();
  const { isAuthenticated, isAdmin, profile, signOut, isLoading } = useAuth();

  return (
    <AppBar position="static">
      <Toolbar>
        <IconButton
          edge="start"
          color="inherit"
          aria-label="menu"
          component={RouterLink}
          to="/"
          sx={{ mr: 2 }}
        >
          <SchoolIcon />
        </IconButton>

        <Typography variant="h6" component="div" sx={{ flexGrow: 1, fontWeight: "bold" }}>
          КТП Hub
        </Typography>

        <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
          <Button color="inherit" component={RouterLink} to="/ktp">
            {t.nav.ktp}
          </Button>
          <Button color="inherit" component={RouterLink} to="/tup-catalog">
            Каталог ТУП
          </Button>
          <Button color="inherit" component={RouterLink} to="/ktp-catalog">
            Каталог КТП
          </Button>
          {isAdmin && (
            <Button color="inherit" component={RouterLink} to="/admin/tup">
              Админ ТУП
            </Button>
          )}
          <Button color="inherit" component={RouterLink} to="/title-page">
            {t.nav.titlePage}
          </Button>
          <Button color="inherit" component={RouterLink} to="/explanatory-note">
            {t.nav.explanatoryNote}
          </Button>
          <Button color="inherit" component={RouterLink} to="/grade-journal">
            {t.nav.gradeJournal}
          </Button>
          <Button color="inherit" component={RouterLink} to="/sor-soch-logger">
            {t.nav.docAnalysis}
          </Button>
          <Button color="inherit" component={RouterLink} to="/settings">
            {t.nav.settings}
          </Button>

          {!isLoading && (
            isAuthenticated ? (
              <>
                <Typography variant="body2" sx={{ mx: 1 }}>
                  {profile?.displayName || profile?.email}
                </Typography>
                <Button color="inherit" onClick={() => void signOut()}>
                  Выйти
                </Button>
              </>
            ) : (
              <Button color="inherit" component={RouterLink} to="/login">
                Войти
              </Button>
            )
          )}

          <Box sx={{ ml: 1 }}>
            <LanguageSwitcher />
          </Box>
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default Header;
