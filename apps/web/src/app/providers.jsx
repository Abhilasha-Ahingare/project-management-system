import { useEffect } from "react";
import { Provider, useDispatch } from "react-redux";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastContainer } from "react-toastify";
import { store, clear } from "./store";
import { setUnauthorizedHandler } from "../api/client";
import "react-toastify/dist/ReactToastify.css";
const client = new QueryClient({
  defaultOptions: { queries: { staleTime: 30000, retry: 1 } },
});
function AuthBridge() {
  const dispatch = useDispatch();
  useEffect(
    () =>
      setUnauthorizedHandler(() => {
        dispatch(clear());
        client.clear();
      }),
    [dispatch],
  );
  return null;
}
export default function Providers({ children }) {
  return (
    <Provider store={store}>
      <QueryClientProvider client={client}>
        <AuthBridge />
        {children}
        <ToastContainer
          position="bottom-right"
          newestOnTop
          closeOnClick
          pauseOnHover
          icon={false}
          toastClassName="projecthub-toast"
          bodyClassName="projecthub-toast-body"
        />
      </QueryClientProvider>
    </Provider>
  );
}
