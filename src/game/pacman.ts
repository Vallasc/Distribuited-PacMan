import * as THREE from "three"
import type { KeyState } from "./keyboard"
import type { World } from "./world"
import type { GameState } from "./state"
import { Mesh, Utils } from "./utils"
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader'
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry'
import JsonFont from "../font/Press_Start_2P_Regular.json";
import type { Ghost } from "./ghost"

export class Pacman {
    static readonly PACMAN_SPEED = 2.5
    static readonly PACMAN_RADIUS = 0.4

    static readonly PACMAN_ONLINE_MATERIAL = new THREE.MeshLambertMaterial({ color: 'yellow', side: THREE.DoubleSide })
    static readonly PACMAN_OFFLINE_MATERIAL = new THREE.MeshLambertMaterial({ color: 'gray', side: THREE.DoubleSide })

    public id: string
    public name: string
    public peerId: number

    // true if the player press start button
    public isPlaying: boolean
    // true if the player has tab open
    public isOnline: boolean

    // true if the pacman is alive
    public isAlive: boolean
    public lostTime: number

    public mesh: Mesh
    public textMesh: THREE.Mesh
    public frames: Array<THREE.SphereGeometry>
    // public color

    public distanceMoved: number
    public direction: THREE.Vector3
    public isMoving: boolean
    //public deletedFlag: number = 0

    constructor(id: string, name: string, peerId: number, position: THREE.Vector3) {
        this.id = id
        this.name = name
        this.isPlaying = false
        this.isOnline = true
        this.peerId = peerId

        // Create spheres with decreasingly small horizontal sweeps, in order
        // to create pacman "death" animation.
        let pacmanGeometries = new Array<THREE.SphereGeometry>()
        let numFrames = 40
        for (let i = 0; i < numFrames; i++) {
            let offset = (i / (numFrames - 1)) * Math.PI
            pacmanGeometries.push(new THREE.SphereGeometry(Pacman.PACMAN_RADIUS, 32, 32, offset, Math.PI * 2 - offset * 2))
            pacmanGeometries[i].rotateX(Math.PI / 2)
        }

        let pacmanMaterial = Pacman.PACMAN_ONLINE_MATERIAL

        this.mesh = new Mesh(pacmanGeometries[0], pacmanMaterial)
        this.frames = pacmanGeometries

        this.distanceMoved = 0

        // Initialize pacman facing to the left.
        this.mesh.position.copy(position)
        this.direction = new THREE.Vector3(-1, 0, 0)
        
        this.isMoving = false
        this.isAlive = true
        this.mesh.isPacman = true
    }

    // Update pacman mesh simulating the eat movement
    public update(currentPacman: Pacman, timeNow: number) {
        // Animate model
        let frame: number
        if (!this.isAlive) {
            // if pacman got eaten, show dying animation
            let angle = (timeNow - this.lostTime) * Math.PI / 2;
            frame = Math.min(this.frames.length - 1, Math.floor(angle / Math.PI * this.frames.length));
        } else {
            // show eating animation based on how much pacman has moved
            let maxAngle = Math.PI / 4
            let angle = (this.distanceMoved * 2) % (maxAngle * 2)
            if (angle > maxAngle)
                angle = maxAngle * 2 - angle
            frame = Math.floor(angle / Math.PI * this.frames.length)
        }
            this.mesh.geometry = this.frames[frame]

        // Update rotation based on direction so that mouth is always facing forward.
        // The "mouth" part is on the side of the sphere, make it "look" up but
        // set the up direction so that it points forward.
        this.mesh.up.copy(this.direction).applyAxisAngle(Utils.UP, -Math.PI / 2)
        this.mesh.lookAt((new THREE.Vector3()).copy(this.mesh.position).add(Utils.UP))

        if(!this.isOnline){
            this.mesh.material = Pacman.PACMAN_OFFLINE_MATERIAL
            if(this.textMesh){
                this.textMesh.material = Pacman.PACMAN_OFFLINE_MATERIAL
            }
        } else {
            this.mesh.material = Pacman.PACMAN_ONLINE_MATERIAL
            if(this.textMesh){
                this.textMesh.material = Pacman.PACMAN_ONLINE_MATERIAL
            }
        }

        // Update text mesh
        if(this.textMesh){
            // Position text just above pacman.
            this.textMesh.position.copy(this.mesh.position).add(Utils.UP)
            // Rotate text so that it faces same direction as pacman.
            this.textMesh.up.copy(currentPacman.direction)
            this.textMesh.lookAt(this.textMesh.position.clone().add(Utils.UP))
            this.textMesh.rotateX(Math.PI/2)
        }
    }

    public moveFake(delta: number){
        if(this.isMoving){
            this.mesh.translateOnAxis(this.direction, delta * Pacman.PACMAN_SPEED)
            // TODO WALL
        }
    }

    // Elaborate key pressed and change pacman position
    public move(delta: number, keys: KeyState, levelMap: World) {
    
        this.isMoving = false
        // Move based on current keys being pressed.
        if (keys.getKeyState('KeyW') || keys.getKeyState('ArrowUp')) {
            // W - move forward
            //pacman.translateOnAxis(pacman.direction, PACMAN_SPEED * delta)
            // Because we are rotating the object above using lookAt, "forward" is to the left.
            this.mesh.translateOnAxis(Utils.LEFT, Pacman.PACMAN_SPEED * delta)
            this.distanceMoved += Pacman.PACMAN_SPEED * delta
            this.isMoving = true
        }
        if (keys.getKeyState('KeyA') || keys.getKeyState('ArrowLeft')) {
            // A - rotate left
            this.direction.applyAxisAngle(Utils.UP, Math.PI / 2 * delta)
        }
        if (keys.getKeyState('KeyD') || keys.getKeyState('ArrowRight')) {
            // D - rotate right
            this.direction.applyAxisAngle(Utils.UP, -Math.PI / 2 * delta)
        }
        if (keys.getKeyState('KeyS') || keys.getKeyState('ArrowDown')) {
            // S - move backward
            this.mesh.translateOnAxis(Utils.LEFT, -Pacman.PACMAN_SPEED * delta)
            this.distanceMoved += Pacman.PACMAN_SPEED * delta
            this.isMoving = true
        }

        // Check for collision with walls
        let leftSide = this.mesh.position.clone().addScaledVector(Utils.LEFT, Pacman.PACMAN_RADIUS).round()
        let topSide = this.mesh.position.clone().addScaledVector(Utils.TOP, Pacman.PACMAN_RADIUS).round()
        let rightSide = this.mesh.position.clone().addScaledVector(Utils.RIGHT, Pacman.PACMAN_RADIUS).round()
        let bottomSide = this.mesh.position.clone().addScaledVector(Utils.BOTTOM, Pacman.PACMAN_RADIUS).round()
        if (levelMap.isWall(leftSide)) {
            this.mesh.position.x = leftSide.x + 0.5 + Pacman.PACMAN_RADIUS
        }
        if (levelMap.isWall(rightSide)) {
            this.mesh.position.x = rightSide.x - 0.5 - Pacman.PACMAN_RADIUS
        }
        if (levelMap.isWall(topSide)) {
            this.mesh.position.y = topSide.y - 0.5 - Pacman.PACMAN_RADIUS
        }
        if (levelMap.isWall(bottomSide)) {
            this.mesh.position.y = bottomSide.y + 0.5 + Pacman.PACMAN_RADIUS
        }

        // Wrap packman to level map
        levelMap.wrapObject(this.mesh)
    
    }

    public eatDots(state: GameState){
        let x = Math.round(this.mesh.position.x), y = Math.round(this.mesh.position.y)
        let dot = state.getDot(x, y)
        if(dot != null) {
            dot.pacmanId = this.id
            state.updateDotShared(dot)
        }
    }

    public checkGhostCollision(ghost: Ghost, timeNow: number) {
        if(this.isAlive && Utils.distance(this.mesh.position, ghost.mesh.position) < Pacman.PACMAN_RADIUS*2){
            console.log("YOU DIED")
            this.isAlive = false
            this.lostTime = timeNow
        }
    }

    public dieAnimation() {

    }

    // Add mesh to 3d scene
    public addToScene(scene: THREE.Scene) {
        scene.add(this.mesh)
        if(this.textMesh)
            scene.add(this.textMesh)
    }

    public makeTextNick() {
        let textMaterial = new THREE.MeshPhongMaterial({color: 'yellow'})
        // Show 3D text banner.
        let loader = new FontLoader()
        let font = loader.parse(JsonFont)

        let textGeometry = new TextGeometry(this.name, {
            font: font,
            size: 0.18,
            height: 0.05
        })

        this.textMesh = new THREE.Mesh(textGeometry, textMaterial)
        var center = new THREE.Vector3();
        this.textMesh.geometry.computeBoundingBox();
        this.textMesh.geometry.boundingBox.getCenter(center);
        this.textMesh.geometry.center();
    }

    // Get plain js object
    public toPlainObj(): Object {
        let obj: any = {}
        obj["id"] = this.id
        obj["name"] = this.name
        obj["peerId"] = this.peerId
        obj["position"] = [ this.mesh.position.x, this.mesh.position.y, this.mesh.position.z]
        obj["direction"] = [ this.direction.x, this.direction.y, this.direction.z]
        obj["distanceMoved"] = this.distanceMoved
        obj["isMoving"] = this.isMoving
        obj["isPlaying"] = this.isPlaying
        obj["isOnline"] = this.isOnline
        obj["isAlive"] = this.isAlive
        return obj
    }

    // New pacman from plain js object
    public static fromObj(obj: any): Pacman {
        let position = new THREE.Vector3(obj["position"][0], obj["position"][1], obj["position"][2])
        let out = new Pacman(obj["id"], obj["name"], obj["peerId"], position)
        out.copyObj(obj)
        return out
    }

    // Copy from a js plain object
    public copyObj(obj: any) {    
        this.mesh.position.set(obj["position"][0], obj["position"][1], obj["position"][2])
        this.direction.set(obj["direction"][0], obj["direction"][1], obj["direction"][2])
        this.distanceMoved = obj["distanceMoved"]
        this.isMoving = obj["isMoving"]
        this.isPlaying = obj["isPlaying"]
        this.isOnline = obj["isOnline"]
        this.isAlive = obj["isAlive"]
    }

    // Copy object if it has the same id
    public copyObjIfSameId(obj: any): boolean{
        if(obj["id"] == this.id){
            this.copyObj(obj)
            return true
        }
        return false
    }
}