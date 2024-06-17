// steam-widgets.d.ts

declare namespace JSX {
  interface IntrinsicElements {
    'steam-app': React.DetailedHTMLProps<React.HTMLAttributes<HTMLDivElement>, HTMLDivElement> & {'appid': string } & {'onlinecount': string};
    'steam-user': React.DetailedHTMLProps<React.HTMLAttributes<HTMLDivElement>, HTMLDivElement> & {'steamid': string};
  }
}

declare module 'steamwidgets.js';