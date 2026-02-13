import mapboxgl from 'mapbox-gl';

export interface Photo {
    id: string;
    lng: number;
    lat: number;
    img: string;
    name?: string;
    dateTime?: string;
    marker?: mapboxgl.Marker;
    aiText?: string;
    locationName?: string;
    weather?: any;
    userText?: string; // Add userText for story mode
    caption?: string;
    heading?: number;
}
