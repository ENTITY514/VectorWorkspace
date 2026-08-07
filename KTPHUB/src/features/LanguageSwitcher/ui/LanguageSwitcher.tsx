// src/features/LanguageSwitcher/ui/LanguageSwitcher.tsx

import React, { useState } from "react";
import { Button, Menu, MenuItem, ListItemIcon, ListItemText } from "@mui/material";
import LanguageIcon from "@mui/icons-material/Language";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import { useTranslation, Language } from "../../../shared/lib/i18n";

const LANGUAGES: Array<{ code: Language; label: string; flag: string }> = [
  { code: "kk", label: "Қазақша", flag: "🇰🇿" },
  { code: "ru", label: "Русский", flag: "🇷🇺" },
  { code: "en", label: "English", flag: "🇬🇧" },
];

export const LanguageSwitcher: React.FC = () => {
  const { language, setLanguage } = useTranslation();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const open = Boolean(anchorEl);

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleSelect = (code: Language) => {
    setLanguage(code);
    handleClose();
  };

  const currentLang = LANGUAGES.find((l) => l.code === language) || LANGUAGES[1];

  return (
    <>
      <Button
        color="inherit"
        onClick={handleClick}
        startIcon={<LanguageIcon />}
        endIcon={<KeyboardArrowDownIcon />}
        sx={{
          textTransform: "none",
          fontWeight: "bold",
          px: 1.5,
          borderRadius: 2,
          backgroundColor: "rgba(255, 255, 255, 0.12)",
          "&:hover": {
            backgroundColor: "rgba(255, 255, 255, 0.22)",
          },
        }}
      >
        <span style={{ marginRight: 6 }}>{currentLang.flag}</span>
        {currentLang.label}
      </Button>

      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "right",
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "right",
        }}
      >
        {LANGUAGES.map((lang) => (
          <MenuItem
            key={lang.code}
            selected={lang.code === language}
            onClick={() => handleSelect(lang.code)}
          >
            <ListItemIcon sx={{ fontSize: "1.2rem", minWidth: "32px !important" }}>
              {lang.flag}
            </ListItemIcon>
            <ListItemText primary={lang.label} />
          </MenuItem>
        ))}
      </Menu>
    </>
  );
};
