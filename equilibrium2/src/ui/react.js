// React, ReactDOM and Recharts are vendored script tags in the page template; this module
// re-exports them so the rest of the UI can import rather than rely on globals.
export const React = window.React;
export const ReactDOM = window.ReactDOM;
export const { useState, useEffect, useMemo } = React;
export const h = React.createElement;
export const { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceArea, ReferenceLine } = window.Recharts;
