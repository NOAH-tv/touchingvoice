// Public deployment settings only. Never place provider secrets here.
const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname);
export const config = Object.freeze({
  firebase: Object.freeze({apiKey:'AIzaSyALL2p6zE5_AzS6V025MzPElXqjUUhhqp8', authDomain:'touchingvoice-d1b1b.firebaseapp.com', projectId:'touchingvoice-d1b1b', appId:'1:548781546332:web:b5b60389e164858e627f99'}),
  apiUrl: 'https://script.google.com/macros/s/AKfycbyuQ_lqKpgP_t4dKEch0kge-uCdpSnGSeDs8NKnEOxWckupfLCXR8LYRv-SnSedpiSc/exec',
  providers: Object.freeze({google:true, apple:false}),
  studioUrl: './studio/index.html',
  preview: loopback && (['/preview.html','/checkin.html'].includes(location.pathname) || location.pathname.startsWith('/studio/')),
  firstpayAllowedHosts: Object.freeze(['pay.firstpay.co.kr','ps.firstpay.co.kr']),
});
