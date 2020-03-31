const CONSTANTS = require('./constants')

const https = require('https');
const http = require('http');
const queryString = require('querystring')
const url = require('url');
const open = require('open')

const BASE_URL = "https://api.spotify.com/v1"
const CODE_REQ_URL = `https://accounts.spotify.com/authorize?client_id=${CONSTANTS.CLIENT_ID}&response_type=code&redirect_uri=${CONSTANTS.REDIRECT_URI_ENC}&scope=user-read-private%20user-read-email&show_dialog=false`
const TOKEN_REQ_URL = "https://accounts.spotify.com/api/token"

let PLAYLISTS = ["Pop", "Rock", "Folk", "Indie", "Trance", "Country", "Jazz", "R&B", "Dance", "Hip Hop"]

let authCode = ""
let tracks = []

const tempServer = http.createServer(req => {
    authCode = url.parse(req.url, true).query.code;
    getAccessToken(authCode);
}).listen(3000);

function handleAuth() {
    https.get(CODE_REQ_URL,
    async res => {
        await open(res.headers.location, { background: true })
    })
}

function getAccessToken(authCode) {

    tempServer.close();

    const postBody = queryString.stringify({
        "grant_type": "authorization_code",
        "code": authCode,
        "redirect_uri": CONSTANTS.REDIRECT_URI
    })

    const options = {
        method: 'POST',
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            'Content-Length': postBody.length,
            "Authorization": `Basic ${Buffer.from(`${CONSTANTS.CLIENT_ID}:${CONSTANTS.CLIENT_SECRET}`).toString('base64')}`
        }
    }

    https.request(TOKEN_REQ_URL,
    options,
    res => {
      res.on('data', data => {
          authTokenBody = JSON.parse(data.toString());
          fetchTracks(authTokenBody)
      })
    }).write(postBody);
}

function fetchTracks(authTokenBody, url = `${BASE_URL}/playlists/${CONSTANTS.PLAYLIST_ID}/tracks`) {
        https.get(url, 
        {
            headers: {
                "Authorization": `Bearer ${authTokenBody.access_token}`
            }    
        }, 
        res => {
            let resString = ""
            res.on('data', res => {
                resString += res.toString()
            })
            res.on('end', res => {
                res = JSON.parse(resString)
                tracks.push(...res.items);
                if(res.next !== null) fetchTracks(authTokenBody, res.next)
                else performClassification(authTokenBody)
            })
        })
}

function addToGenres(authTokenBody) {
    tracks.map(track => ({
        ...track,
        artist_ids: track.track.artists.map(artist => artist.id),
        possible_genres: genreHelper(track.track.artists.map(artist => artist.id))
    }))
}

function genreHelper(artists) {
    let genres = []
    artists.forEach(artistId => {
        let url = `${BASE_URL}/artists/${artistId}`
        https.get(url,
            {
                headers: {
                    "Authorization": `Bearer ${authTokenBody.access_token}`
                }
            },
            res => {
                let resString = ""
                res.on('data', res => {
                    resString += res.toString()
                })
                res.on('end', res => {
                    res = JSON.parse(resString)
                    if (res.genres !== undefined) {
                        res.genres.forEach(genre => {
                            genres.push(genre);
                        })
                    }
                })
            })
    }) 
    return genres
}

async function createGenrePlaylists(authTokenBody) {
    await addToGenres(authTokenBody)
    
    const postBody = queryString.stringify({
        "name": PLAYLISTS.pop()
    })

    const options = {
        method: 'POST',
        headers: {
            "Content-Type": "application/json",
            'Content-Length': postBody.length,
            "Authorization": `Bearer ${ authTokenBody.access_token }`
        }
    }

    https.request(`${BASE_URL}/users/${CONSTANTS.USER_URI}/playlists`,
        options,
        res => {
            res.on('data', data => {
                authTokenBody = JSON.parse(data.toString());
                fetchTracks(authTokenBody)
            })
        }).write(postBody);
}

function performClassification(authTokenBody) {
    tracks = tracks.filter(
        track => track !== null && 
        track.hasOwnProperty("track") && 
        track.track !== null
        )
    createGenrePlaylists(authTokenBody)
}

handleAuth()
