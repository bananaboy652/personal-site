// steam-widgets.d.ts

declare namespace JSX {
  interface IntrinsicElements {
    'steam-app': React.DetailedHTMLProps<React.HTMLAttributes<HTMLDivElement>, HTMLDivElement> & {'appid': string };
    'steam-user': React.DetailedHTMLProps<React.HTMLAttributes<HTMLDivElement>, HTMLDivElement> & {'steamid': string};
  }
}
