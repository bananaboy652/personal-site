import React, { useEffect } from 'react';

class SteamAppElem extends HTMLElement {
    connectedCallback() {
        const appid = this.getAttribute('appid');
        const lang = this.getAttribute('lang') || 'english';
        const playtext = this.getAttribute('playtext') || 'Play on Steam';
        const author = this.getAttribute('author') || 'By :developer';
        const onlinecount = this.getAttribute('onlinecount');
        const rating = parseInt(this.getAttribute('rating') || '0');
        const width = this.getAttribute('width');
        const height = this.getAttribute('height');
        const styleBorder = this.getAttribute('style-border');
        const styleShadow = parseInt(this.getAttribute('style-shadow') || '1');
        const styleColorBackground = this.getAttribute('style-color-background');
        const styleColorTitle = this.getAttribute('style-color-title');
        const styleColorDescription = this.getAttribute('style-color-description');
        const styleColorAuthor = this.getAttribute('style-color-author');
        const styleColorOnlinecount = this.getAttribute('style-color-onlinecount');
        const styleHideImage = parseInt(this.getAttribute('style-hideimage') || '0');

        if (appid !== null) {
            this.setupWidget({
                appid,
                lang,
                playtext,
                author,
                onlinecount,
                rating,
                width,
                height,
                styleBorder,
                styleShadow,
                styleColorBackground,
                styleColorTitle,
                styleColorDescription,
                styleColorAuthor,
                styleColorOnlinecount,
                styleHideImage,
            });
        }
    }

    setupWidget({
        appid,
        lang,
        playtext,
        author,
        onlinecount,
        rating,
        width,
        height,
        styleBorder,
        styleShadow,
        styleColorBackground,
        styleColorTitle,
        styleColorDescription,
        styleColorAuthor,
        styleColorOnlinecount,
        styleHideImage,
    }) {
        const req = new XMLHttpRequest();
        const self = this;

        req.onreadystatechange = function () {
            if (req.readyState === XMLHttpRequest.DONE) {
                const json = JSON.parse(req.responseText);
                const developers = json.data.developers.join(', ');
                author = author.replace(':developer', developers);

                const html = `
                    <div class="steam-app" style="max-width: ${width}px; border-radius: ${styleBorder}; box-shadow: ${styleShadow ? '0 4px 8px rgba(0, 0, 0, 0.1)' : 'none'}; background-color: ${styleColorBackground};">
                        <div class="steam-app-image" style="background-image: url('${json.data.header_image}'); height: ${height}px; ${styleHideImage ? 'display: none;' : ''}"></div>
                        <div class="steam-app-infos">
                            <div class="steam-app-title">
                                <div class="steam-app-title-left">
                                    <div class="steam-app-title-left-name" style="color: ${styleColorTitle};">${json.data.name}</div>
                                    <div class="steam-app-title-left-rating">${'⭐'.repeat(rating)}</div>
                                </div>
                                <div class="steam-app-title-right" style="color: ${styleColorOnlinecount};">${onlinecount ? onlinecount.replace(':count', json.data.online_count) : ''}</div>
                            </div>
                            <div class="steam-app-description" style="color: ${styleColorDescription};">${json.data.short_description}</div>
                            <div class="steam-app-footer">
                                <div class="steam-app-footer-author" style="color: ${styleColorAuthor};">${author}</div>
                                <div class="steam-app-footer-button"><a href="https://store.steampowered.com/app/${appid}">${playtext}</a></div>
                            </div>
                        </div>
                    </div>`;
                self.innerHTML = html;
            }
        };
        req.open('GET', `https://www.steamwidgets.net/api/query/app?appid=${appid}&lang=${lang}`, true);
        req.send();
    }
}

// Ensure the custom element is defined only once
if (!window.customElements.get('steam-app')) {
    window.customElements.define('steam-app', SteamAppElem);
}

const SteamApp = ({ appId, ...props }) => {
    useEffect(() => {
        const steamAppElem = document.createElement('steam-app');
        Object.entries(props).forEach(([key, value]) => steamAppElem.setAttribute(key, value));
        steamAppElem.setAttribute('appid', appId);
        document.getElementById(`steamAppContainer-${appId}`).appendChild(steamAppElem);
        return () => {
            steamAppElem.remove();
        };
    }, [appId, props]);

    return <div id={`steamAppContainer-${appId}`} />;
};

export default SteamApp;
