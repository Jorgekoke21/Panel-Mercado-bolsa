-- MarketRadar · Fase 2B.2 · 0010 — datasets de precios gratuitos de EE. UU. (Alpaca Basic).
-- Las tablas de precios y acciones corporativas son las mismas (daily_prices, corporate_actions,
-- adjustment_factors): solo cambia la procedencia (source = 'alpaca').

insert into public.datasets (key, name, source, source_url, license, is_secondary_source, notes) values
  ('alpaca-eod-prices', 'Alpaca daily bars (SIP)', 'Alpaca Markets — Market Data API v2 (Basic plan)', 'https://docs.alpaca.markets/docs/about-market-data-api',
   'Alpaca Basic (free) market data for personal use; not licensed for redistribution or public display.', false,
   'Unadjusted OHLCV (adjustment=raw), consolidated SIP feed, history since 2016.'),
  ('alpaca-corporate-actions', 'Alpaca corporate actions', 'Alpaca Markets — Corporate Actions API v1', 'https://docs.alpaca.markets/reference/corporateactions-1',
   'Alpaca Basic (free) market data for personal use; not licensed for redistribution or public display.', false,
   'Splits and cash dividends (declared rate, unadjusted); special / foreign dividends, stock dividends and spin-offs kept as unsupported.');
