import React from "react";
import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import App from "./App";
import { store } from "./store/store";
import { LanguageProvider } from "./shared/lib/i18n";
import { AuthProvider } from "./entities/session";

test("renders the app shell with the header", () => {
  render(
    <Provider store={store}>
      <LanguageProvider>
        <MemoryRouter initialEntries={["/login"]}>
          <AuthProvider>
            <App />
          </AuthProvider>
        </MemoryRouter>
      </LanguageProvider>
    </Provider>
  );

  expect(screen.getByText(/КТП Hub/i)).toBeInTheDocument();
});